// POST /.netlify/functions/order — receives an order, re-validates and re-prices it,
// stores it via a Google Sheets webhook, and sends server-side Lead events (Meta CAPI, TikTok Events API).
// All secrets come from environment variables; nothing secret lives in the frontend.
"use strict";
const crypto = require("crypto");

const UNIT_PRICE = 179;            // authoritative price — never trust the client
const MAX_QTY = 3;
const PRODUCT = { id: "pack2-earbuds", name: "باك 2 سماعات بلا خيط" };
const env = (k) => (process.env[k] || "").trim();

const hits = new Map(); // best-effort rate limit per warm instance
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, max = 5;
  const list = (hits.get(ip) || []).filter((t) => now - t < win);
  list.push(now); hits.set(ip, list);
  return list.length > max;
}

const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
function normPhone(v) {
  const d = String(v || "").replace(/[\s.\-()]/g, "");
  if (/^\+212[5-7]\d{8}$/.test(d)) return "0" + d.slice(4);
  if (/^00212[5-7]\d{8}$/.test(d)) return "0" + d.slice(5);
  if (/^212[5-7]\d{8}$/.test(d)) return "0" + d.slice(3);
  if (/^0[5-7]\d{8}$/.test(d)) return d;
  return null;
}
const sha = (v) => (v ? crypto.createHash("sha256").update(String(v).trim().toLowerCase()).digest("hex") : undefined);

function validate(body) {
  const c = (body && body.customer) || {}, p = (body && body.product) || {};
  const o = {
    name: clean(c.name, 80), phone: normPhone(c.phone), city: clean(c.city, 60),
    address: clean(c.address, 250), notes: clean(c.notes, 200), qty: Number(p.quantity)
  };
  const errors = [];
  if (o.name.length < 3) errors.push("name");
  if (!o.phone) errors.push("phone");
  if (o.city.length < 2) errors.push("city");
  if (!Number.isInteger(o.qty) || o.qty < 1 || o.qty > MAX_QTY) errors.push("quantity");
  o.unit_price = UNIT_PRICE; o.subtotal = o.qty * UNIT_PRICE; o.delivery_fee = 0; o.total = o.subtotal;
  return { o, errors };
}

const reply = (code, obj, origin) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": origin || "*", "Cache-Control": "no-store" },
  body: JSON.stringify(obj)
});

async function postJSON(url, data, ms = 8000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), signal: ctl.signal }); return r; }
  finally { clearTimeout(t); }
}

async function sendMeta(o, body, ip, ua) {
  if (!env("META_PIXEL_ID") || !env("META_CAPI_TOKEN")) return "skipped";
  const ev = {
    event_name: "Lead", event_time: Math.floor(Date.now() / 1000), event_id: clean(body.event_id, 80), action_source: "website",
    event_source_url: clean(body.page_url, 500),
    user_data: { ph: [sha("212" + o.phone.slice(1))], ct: [sha(o.city)], country: [sha("ma")], fbp: clean(body.fbp, 200) || undefined, fbc: clean(body.fbc, 300) || undefined, client_ip_address: ip, client_user_agent: ua },
    custom_data: { currency: "MAD", value: o.total, content_ids: [PRODUCT.id], content_type: "product", num_items: o.qty }
  };
  const url = `https://graph.facebook.com/v19.0/${env("META_PIXEL_ID")}/events?access_token=${encodeURIComponent(env("META_CAPI_TOKEN"))}`;
  const data = { data: [ev] }; if (env("META_TEST_EVENT_CODE")) data.test_event_code = env("META_TEST_EVENT_CODE");
  const r = await postJSON(url, data); return r.ok ? "sent" : "error " + r.status;
}

async function sendTikTok(o, body, ip, ua) {
  if (!env("TIKTOK_PIXEL_ID") || !env("TIKTOK_ACCESS_TOKEN")) return "skipped";
  const data = {
    event_source: "web", event_source_id: env("TIKTOK_PIXEL_ID"),
    data: [{
      event: "SubmitForm", event_time: Math.floor(Date.now() / 1000), event_id: clean(body.event_id, 80),
      user: { phone: sha("+212" + o.phone.slice(1)), ip, user_agent: ua, ttp: clean(body.ttp, 200) || undefined, ttclid: clean(body.attribution && body.attribution.ttclid, 300) || undefined },
      page: { url: clean(body.page_url, 500) },
      properties: { currency: "MAD", value: o.total, contents: [{ content_id: PRODUCT.id, content_name: PRODUCT.name, quantity: o.qty, price: UNIT_PRICE }] }
    }]
  };
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", { method: "POST", headers: { "Content-Type": "application/json", "Access-Token": env("TIKTOK_ACCESS_TOKEN") }, body: JSON.stringify(data), signal: ctl.signal });
    return r.ok ? "sent" : "error " + r.status;
  } finally { clearTimeout(t); }
}

exports.handler = async (event) => {
  const origin = env("ALLOWED_ORIGIN") || "*";
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } };
  if (event.httpMethod !== "POST") return reply(405, { ok: false }, origin);
  if ((event.body || "").length > 10000) return reply(413, { ok: false }, origin);

  const ip = (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ua = clean(event.headers["user-agent"], 400);
  if (limited(ip || "unknown")) return reply(429, { ok: false, message: "لقد تجاوزت عدد المحاولات المسموح به. يُرجى المحاولة بعد قليل." }, origin);

  let body; try { body = JSON.parse(event.body || "{}"); } catch (e) { return reply(400, { ok: false }, origin); }
  // spam: honeypot filled or form sent impossibly fast — pretend nothing, store nothing
  if (body.hp || Number(body.elapsed_ms) < 2500) return reply(400, { ok: false, message: "تعذّر تسجيل طلبك. يُرجى المحاولة مرة أخرى." }, origin);

  const { o, errors } = validate(body);
  if (errors.length) return reply(422, { ok: false, fields: errors, message: "بعض المعلومات ناقصة أو غير صحيحة. يُرجى مراجعتها ثم إعادة المحاولة." }, origin);

  if (!env("SHEETS_WEBHOOK_URL")) { console.error("SHEETS_WEBHOOK_URL is not set"); return reply(503, { ok: false, message: "نعتذر، خدمة استقبال الطلبات غير متاحة حالياً. يُرجى المحاولة بعد قليل." }, origin); }

  const ref = "EP-" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  const a = body.attribution && typeof body.attribution === "object" ? body.attribution : {};
  const row = {
    secret: env("SHEETS_SECRET"), ref, created_at: new Date().toISOString(),
    name: o.name, phone: o.phone, city: o.city, address: o.address, notes: o.notes,
    product: PRODUCT.name, quantity: o.qty, unit_price: o.unit_price, subtotal: o.subtotal, delivery_fee: 0, total: o.total, currency: "MAD",
    utm_source: clean(a.utm_source, 100), utm_medium: clean(a.utm_medium, 100), utm_campaign: clean(a.utm_campaign, 150),
    utm_content: clean(a.utm_content, 150), utm_term: clean(a.utm_term, 100), fbclid: clean(a.fbclid, 300), ttclid: clean(a.ttclid, 300),
    status: "جديد"
  };

  let stored = false;
  try { const r = await postJSON(env("SHEETS_WEBHOOK_URL"), row, 10000); const j = await r.json().catch(() => ({})); stored = r.ok && j.ok === true; }
  catch (e) { console.error("sheet error", e.message); }
  if (!stored) return reply(502, { ok: false, message: "تعذّر تسجيل طلبك في الوقت الحالي. معلوماتك محفوظة، يُرجى المحاولة مرة أخرى." }, origin);

  // Lead events are best-effort and never block the customer
  const [meta, tiktok] = await Promise.allSettled([sendMeta(o, body, ip, ua), sendTikTok(o, body, ip, ua)]);
  console.log("order", ref, "meta:", meta.value || meta.reason, "tiktok:", tiktok.value || tiktok.reason);

  // stages are only "registered" here; confirm/prepare/ship/deliver come later from your order system
  return reply(200, { ok: true, ref, total: o.total, stages: { confirm: false, prepare: false, ship: false, deliver: false } }, origin);
};

exports._test = { validate, normPhone, clean, UNIT_PRICE };
