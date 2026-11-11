// POST /.netlify/functions/order — validates and re-prices an order, then stores it in Sheets.
"use strict";
const crypto = require("crypto");

const UNIT_PRICE = 179;            // authoritative price — never trust the client
const MAX_QTY = 3;
const PRODUCT = "باك 2 سماعات بلا خيط";
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
  const d = String(v || "").replace(/[\s.\-()\u200e\u200f]/g, "")
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632));
  if (/^\+212[5-7]\d{8}$/.test(d)) return "0" + d.slice(4);
  if (/^00212[5-7]\d{8}$/.test(d)) return "0" + d.slice(5);
  if (/^212[5-7]\d{8}$/.test(d)) return "0" + d.slice(3);
  if (/^0[5-7]\d{8}$/.test(d)) return d;
  return null;
}
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

exports.handler = async (event) => {
  const origin = env("ALLOWED_ORIGIN") || "*";
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } };
  if (event.httpMethod !== "POST") return reply(405, { ok: false }, origin);
  if ((event.body || "").length > 10000) return reply(413, { ok: false }, origin);

  const ip = (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (limited(ip || "unknown")) return reply(429, { ok: false, message: "لقد تجاوزت عدد المحاولات المسموح به. يُرجى المحاولة بعد قليل." }, origin);

  let body; try { body = JSON.parse(event.body || "{}"); } catch (e) { return reply(400, { ok: false }, origin); }
  // spam: honeypot filled or form sent impossibly fast — pretend nothing, store nothing
  if (body.hp || Number(body.elapsed_ms) < 2500) return reply(400, { ok: false, message: "تعذّر تسجيل طلبك. يُرجى المحاولة مرة أخرى." }, origin);

  const { o, errors } = validate(body);
  if (errors.length) return reply(422, { ok: false, fields: errors, message: "بعض المعلومات ناقصة أو غير صحيحة. يُرجى مراجعتها ثم إعادة المحاولة." }, origin);

  const sheetsUrl = env("SHEETS_WEBHOOK_URL"), sheetsSecret = env("SHEETS_SECRET");
  if (!sheetsUrl || !sheetsSecret) { console.error("Sheets webhook configuration is incomplete"); return reply(503, { ok: false, message: "نعتذر، خدمة استقبال الطلبات غير متاحة حالياً. يُرجى المحاولة بعد قليل." }, origin); }

  const ref = "EP-" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  const row = {
    secret: sheetsSecret, ref, created_at: new Date().toISOString(),
    name: o.name, phone: o.phone, city: o.city, address: o.address, notes: o.notes,
    product: PRODUCT, quantity: o.qty, unit_price: o.unit_price, subtotal: o.subtotal, delivery_fee: 0, total: o.total, currency: "MAD",
    status: "جديد"
  };

  let stored = false;
  try { const r = await postJSON(sheetsUrl, row, 10000); const j = await r.json().catch(() => ({})); stored = r.ok && j.ok === true; }
  catch (e) { console.error("sheet error", e.message); }
  if (!stored) return reply(502, { ok: false, message: "تعذّر تسجيل طلبك في الوقت الحالي. يُرجى المحاولة مرة أخرى." }, origin);

  // stages are only "registered" here; confirm/prepare/ship/deliver come later from your order system
  return reply(200, { ok: true, ref, total: o.total, stages: { confirm: false, prepare: false, ship: false, deliver: false } }, origin);
};

exports._test = { validate, normPhone, clean, UNIT_PRICE };
