// Stok — "carteiro" do push: envia um resumo diário de vencimentos (próximos 7 dias) por loja.
// Roda no Supabase Edge Functions (Deno). Usa a service_role (ignora RLS) pra varrer todas as lojas.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@stok.app",
  Deno.env.get("VAPID_PUBLIC")!,
  Deno.env.get("VAPID_PRIVATE")!,
);

const ymd = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async () => {
  // janela: de hoje até +7 dias
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const fim = new Date(hoje); fim.setDate(fim.getDate() + 7);

  // lotes ativos vencendo nos próximos 7 dias, com a loja do produto
  const { data: lots, error: lotErr } = await supabase
    .from("lots")
    .select("quantity, expiry, products(store_id)")
    .gt("quantity", 0)
    .gte("expiry", ymd(hoje))
    .lte("expiry", ymd(fim));
  if (lotErr) return new Response(JSON.stringify({ error: lotErr.message }), { status: 500 });

  // conta quantos lotes por loja
  const porLoja: Record<string, number> = {};
  for (const l of lots ?? []) {
    const sid = (l as any).products?.store_id;
    if (sid) porLoja[sid] = (porLoja[sid] ?? 0) + 1;
  }

  // todas as inscrições de push
  const { data: subs, error: subErr } = await supabase.from("push_subscriptions").select("*");
  if (subErr) return new Response(JSON.stringify({ error: subErr.message }), { status: 500 });

  let enviadas = 0, removidas = 0;
  for (const s of subs ?? []) {
    const n = porLoja[(s as any).store_id] ?? 0;
    if (n === 0) continue; // nada pra avisar nessa loja
    const corpo = n === 1
      ? "Você tem 1 produto vencendo nos próximos 7 dias."
      : `Você tem ${n} produtos vencendo nos próximos 7 dias.`;
    const payload = JSON.stringify({ title: "Stok — Vencimentos", body: corpo });
    try {
      await webpush.sendNotification(
        { endpoint: (s as any).endpoint, keys: { p256dh: (s as any).p256dh, auth: (s as any).auth } },
        payload,
      );
      enviadas++;
    } catch (err) {
      // 404/410 = inscrição morta (app desinstalado etc.): remove
      const code = (err as any)?.statusCode;
      if (code === 404 || code === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", (s as any).id);
        removidas++;
      }
    }
  }
  return new Response(JSON.stringify({ enviadas, removidas }), { headers: { "Content-Type": "application/json" } });
});
