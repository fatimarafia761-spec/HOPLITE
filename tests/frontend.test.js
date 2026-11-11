const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone, total, ready, validate, orderText } = require('../public/assets/app');
test('pack prices and bounds', () => {
  assert.deepEqual([1, 2, 3].map(total), [179, 358, 537]);
  for (const value of [0, 4, -1, 1.5, 'bad']) assert.equal(total(value), null);
});
test('Moroccan local, international and Arabic-Indic phone numbers', () => {
  for (const value of ['0612345678', '+212612345678', '00212612345678', '٠٦١٢٣٤٥٦٧٨']) assert.equal(normalizePhone(value), '0612345678');
  for (const value of ['', '123', '+33612345678', '0812345678']) assert.equal(normalizePhone(value), null);
});
test('orders fail closed until destination and store policies are provided', () => {
  assert.equal(ready({}), false);
  assert.equal(ready({ ordersEnabled: true, whatsapp: '212612345678' }), false);
  const config = { ordersEnabled: true, whatsapp: '212612345678', deliveryEstimate: 'Confirmed', returnsPolicy: 'Confirmed', warrantyPolicy: 'Confirmed', businessIdentity: 'Store' };
  assert.equal(ready(config), true);
  assert.equal(ready({ ...config, ordersEnabled: false }), false);
  assert.equal(ready({ ...config, whatsapp: '', orderEndpoint: '/api/order' }), false);
  assert.equal(ready({ ...config, whatsapp: '', orderEndpoint: '/api/order', contactEmail: 'orders@example.com' }), true);
});
test('customer validation accepts cities outside the suggestions', () => {
  assert.deepEqual(validate({ name: 'Test Customer', phone: '0612345678', city: 'Small town', quantity: 1 }), {});
  assert.deepEqual(Object.keys(validate({})), ['name', 'phone', 'city', 'quantity']);
});
test('WhatsApp summary makes pack contents and final price clear', () => {
  const text = orderText({ customer: { name: 'Test', phone: '0612345678', city: 'Rabat' }, product: { quantity: 2 } });
  assert.match(text, /358/); assert.match(text, /4 مجموعات/); assert.match(text, /نكملوه فالتأكيد/);
});
