"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { handler, _test } = require("../netlify/functions/order");

const envKeys = ["SHEETS_WEBHOOK_URL", "SHEETS_SECRET", "META_PIXEL_ID", "META_CAPI_TOKEN", "TIKTOK_PIXEL_ID", "TIKTOK_ACCESS_TOKEN"];
let nextIp = 1;

function withEnvironment(values, run) {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  Object.assign(process.env, values);
  const originalFetch = global.fetch;
  return Promise.resolve().then(run).finally(() => {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

function orderEvent(overrides = {}) {
  return {
    httpMethod: "POST",
    headers: { "x-forwarded-for": `192.0.2.${nextIp++}` },
    body: JSON.stringify({
      customer: { name: "Test Customer", phone: "٠٦١٢٣٤٥٦٧٨", city: "الرباط", address: "", notes: "" },
      product: { quantity: 2, unit_price: 1, subtotal: 1, total: 1 },
      event_id: "frontend-event", elapsed_ms: 5000, hp: "",
      attribution: { fbclid: "must-not-be-stored", ttclid: "must-not-be-stored" },
      ...overrides
    })
  };
}

async function responseOf(event) {
  const response = await handler(event);
  return { ...response, json: JSON.parse(response.body) };
}

test("stores valid orders at the server price without forwarding tracking data", async () => {
  await withEnvironment({
    SHEETS_WEBHOOK_URL: "https://sheets.invalid/webhook", SHEETS_SECRET: "test-secret",
    META_PIXEL_ID: "configured-but-unused", META_CAPI_TOKEN: "configured-but-unused",
    TIKTOK_PIXEL_ID: "configured-but-unused", TIKTOK_ACCESS_TOKEN: "configured-but-unused"
  }, async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, row: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ ok: true }) };
    };

    const response = await responseOf(orderEvent());
    assert.equal(response.statusCode, 200);
    assert.equal(response.json.ok, true);
    assert.equal(response.json.total, 358);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://sheets.invalid/webhook");
    assert.equal(calls[0].row.secret, "test-secret");
    assert.equal(calls[0].row.phone, "0612345678");
    assert.equal(calls[0].row.quantity, 2);
    assert.equal(calls[0].row.unit_price, 179);
    assert.equal(calls[0].row.subtotal, 358);
    assert.equal(calls[0].row.total, 358);
    assert.equal("fbclid" in calls[0].row, false);
    assert.equal("ttclid" in calls[0].row, false);
  });
});

test("rejects invalid quantity and phone before storage", async () => {
  await withEnvironment({ SHEETS_WEBHOOK_URL: "https://sheets.invalid/webhook", SHEETS_SECRET: "test-secret" }, async () => {
    global.fetch = async () => assert.fail("invalid order must not reach storage");

    const badQuantity = await responseOf(orderEvent({ product: { quantity: 4 } }));
    assert.equal(badQuantity.statusCode, 422);
    assert.ok(badQuantity.json.fields.includes("quantity"));

    const badPhone = await responseOf(orderEvent({ customer: { name: "Test Customer", phone: "123", city: "الرباط" } }));
    assert.equal(badPhone.statusCode, 422);
    assert.ok(badPhone.json.fields.includes("phone"));
  });
});

test("requires both Sheets settings", async () => {
  for (const values of [
    { SHEETS_SECRET: "test-secret" },
    { SHEETS_WEBHOOK_URL: "https://sheets.invalid/webhook" }
  ]) {
    await withEnvironment(values, async () => {
      global.fetch = async () => assert.fail("missing configuration must not reach storage");
      const response = await responseOf(orderEvent());
      assert.equal(response.statusCode, 503);
      assert.equal(response.json.ok, false);
    });
  }
});

test("reports storage failure without claiming the order was saved", async () => {
  await withEnvironment({ SHEETS_WEBHOOK_URL: "https://sheets.invalid/webhook", SHEETS_SECRET: "test-secret" }, async () => {
    global.fetch = async () => ({ ok: true, json: async () => ({ ok: false }) });
    const response = await responseOf(orderEvent());
    assert.equal(response.statusCode, 502);
    assert.match(response.json.message, /يُرجى المحاولة مرة أخرى/);
    assert.doesNotMatch(response.json.message, /محفوظ/);
  });
});

test("normalizes Arabic-Indic Moroccan phone digits", () => {
  assert.equal(_test.normPhone("٠٦١٢٣٤٥٦٧٨"), "0612345678");
});
