import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
const SUPA_URL = Deno.env.get("SUPABASE_URL");
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  // MP espera 200 rapido; sempre respondemos ok no fim.
  try {
    if (!TOKEN || !SUPA_URL || !SRK) return new Response("ok", { status: 200 });

    const url = new URL(req.url);
    let type = url.searchParams.get("type") || url.searchParams.get("topic") || "";
    let payId = url.searchParams.get("data.id") || url.searchParams.get("id") || "";
    if (req.method === "POST") {
      try {
        const b = await req.json();
        type = b?.type || b?.topic || type;
        payId = b?.data?.id || b?.id || payId;
      } catch (_) { /* sem body */ }
    }
    if (type !== "payment" || !payId) return new Response("ok", { status: 200 });

    // fonte da verdade: consulta o pagamento no MP
    const pr = await fetch(`https://api.mercadopago.com/v1/payments/${payId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const pay = await pr.json();
    if (!pr.ok || pay.status !== "approved") return new Response("ok", { status: 200 });

    const ext = String(pay.external_reference || "");
    const [storeId, plan, cycle] = ext.split("|");
    if (!storeId || !plan || !cycle) return new Response("ok", { status: 200 });

    await fetch(`${SUPA_URL}/rest/v1/rpc/apply_payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SRK, Authorization: `Bearer ${SRK}` },
      body: JSON.stringify({
        p_store: storeId, p_plan: plan, p_cycle: cycle,
        p_mp_id: String(pay.id), p_amount: pay.transaction_amount,
      }),
    });
    return new Response("ok", { status: 200 });
  } catch (_) {
    return new Response("ok", { status: 200 });
  }
});
