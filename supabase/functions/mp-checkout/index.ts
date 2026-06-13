import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
const APP = "https://stok-1db.pages.dev/";
const WEBHOOK = "https://glxtrrjqopwjvpzmzxot.supabase.co/functions/v1/mp-webhook";
const PRICES: Record<string, Record<string, number>> = {
  essencial: { mensal: 59, anual: 590 },
  pro: { mensal: 109, anual: 1090 },
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    if (!TOKEN) return json({ error: "no_token" }, 200);
    const { storeId, plan, cycle, store } = await req.json();
    if (!storeId || !PRICES[plan] || !PRICES[plan][cycle]) return json({ error: "params" }, 400);
    const amount = PRICES[plan][cycle];
    const titulo = `Stok ${plan === "pro" ? "Pro" : "Essencial"} - ${cycle === "anual" ? "Anual" : "Mensal"}`;

    const pref = {
      items: [{ title: titulo, description: store || "Assinatura Stok", quantity: 1, currency_id: "BRL", unit_price: amount }],
      external_reference: `${storeId}|${plan}|${cycle}`,
      metadata: { store_id: storeId, plan, cycle },
      notification_url: WEBHOOK,
      back_urls: { success: APP, failure: APP, pending: APP },
      auto_return: "approved",
      statement_descriptor: "STOK",
    };

    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(pref),
    });
    const j = await r.json();
    if (!r.ok) return json({ error: "mp", detail: j }, 200);
    return json({ init_point: j.init_point || j.sandbox_init_point });
  } catch (e) {
    return json({ error: String(e) }, 200);
  }
});
