// Stok — "carteiro" do push: resumo diário de vencimentos (próximos 7 dias) PERSONALIZADO por pessoa.
// Admin (ou operador sem áreas) é avisado da loja toda; operador com áreas só dos departamentos dele.
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
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const fim = new Date(hoje); fim.setDate(fim.getDate() + 7);

  // lotes ativos vencendo em ≤7 dias, com loja e departamento do produto
  const { data: lots, error: lotErr } = await supabase
    .from("lots")
    .select("expiry, products(store_id, department_id)")
    .gt("quantity", 0)
    .gte("expiry", ymd(hoje))
    .lte("expiry", ymd(fim));
  if (lotErr) return new Response(JSON.stringify({ error: lotErr.message }), { status: 500 });

  // perfis: id -> { role, store_id }
  const { data: profiles } = await supabase.from("profiles").select("id, role, store_id");
  const profById: Record<string, any> = {};
  for (const p of profiles ?? []) profById[(p as any).id] = p;

  // áreas por operador: profile_id -> Set(department_id)
  const { data: opdeps } = await supabase.from("operator_departments").select("profile_id, department_id");
  const areasByProfile: Record<string, Set<string>> = {};
  for (const a of opdeps ?? []) {
    (areasByProfile[(a as any).profile_id] ??= new Set()).add((a as any).department_id);
  }

  // inscrições de push
  const { data: subs, error: subErr } = await supabase.from("push_subscriptions").select("*");
  if (subErr) return new Response(JSON.stringify({ error: subErr.message }), { status: 500 });

  let enviadas = 0, removidas = 0;
  for (const s of subs ?? []) {
    const prof = profById[(s as any).profile_id];
    if (!prof) continue;
    const storeId = prof.store_id;
    const isAdmin = prof.role === "admin";
    const areas = areasByProfile[(s as any).profile_id]; // Set ou undefined

    // conta os lotes relevantes para ESTA pessoa
    let n = 0;
    for (const l of lots ?? []) {
      const pr = (l as any).products;
      if (!pr || pr.store_id !== storeId) continue;
      if (isAdmin || !areas || areas.size === 0) n++;           // vê a loja toda
      else if (areas.has(pr.department_id)) n++;                // só as áreas dele
    }
    if (n === 0) continue;

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
      const code = (err as any)?.statusCode;
      if (code === 404 || code === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", (s as any).id);
        removidas++;
      }
    }
  }
  return new Response(JSON.stringify({ enviadas, removidas }), { headers: { "Content-Type": "application/json" } });
});
