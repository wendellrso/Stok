import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const KEY = Deno.env.get("ANTHROPIC_API_KEY");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    if (!KEY) return json({ error: "no_key" });
    const d = await req.json();
    const fmt = (v: number) => "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const linhas = [
      `Loja: ${d.store || "-"}`,
      `Mes: ${d.mes || "-"}`,
      `Perda este mes: ${fmt(d.perdaMes)}`,
      d.perdaPrev != null ? `Perda mes passado: ${fmt(d.perdaPrev)}` : `Perda mes passado: sem dados`,
      `Lotes criticos (vencem em 7 dias): ${d.critN || 0}`,
      `Vencidos parados na loja: ${d.vencN || 0}`,
      `Saidas no mes (unidades vendidas + oferta): ${d.saidasMes || 0}`,
      d.topDept ? `Setor que mais perdeu: ${d.topDept.name} (${fmt(d.topDept.val)})` : "",
      d.topProd ? `Produto que mais perdeu: ${d.topProd.name} (${d.topProd.q} un)` : "",
    ].filter(Boolean).join("\n");

    const sys = "Voce e um consultor de varejo, socio do dono de um mercadinho pequeno no Brasil. Escreva um parecer curto (no maximo 4 frases), direto e pratico, em portugues do Brasil, com base APENAS nos numeros fornecidos. Comente a tendencia da perda, aponte onde esta o maior problema (setor ou produto) e diga o que fazer agora: gerar oferta nos lotes criticos, recolher vencidos, comprar menos do produto campeao de perda. Tom de parceiro honesto, sem floreio, sem emojis, sem markdown, sem listar tudo. Nao invente numeros alem dos fornecidos. Se nao ha perdas nem criticos, parabenize de forma breve.";

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        system: sys,
        messages: [{ role: "user", content: linhas }],
      }),
    });
    const j = await r.json();
    const text = j?.content?.[0]?.text?.trim() || "";
    return json({ text });
  } catch (e) {
    return json({ error: String(e) });
  }
});
