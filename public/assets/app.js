(function (root) {
  'use strict';
  const PRICE = 179;
  const normalizePhone = value => {
    let phone = String(value || '').replace(/[٠-٩]/g, digit => digit.charCodeAt(0) - 1632).replace(/[\s.\-()\u200e\u200f]/g, '');
    phone = phone.replace(/^(?:\+212|00212|212)(?=[5-7]\d{8}$)/, '0');
    return /^0[5-7]\d{8}$/.test(phone) ? phone : null;
  };
  const total = quantity => Number.isInteger(Number(quantity)) && quantity >= 1 && quantity <= 3 ? Number(quantity) * PRICE : null;
  const validWhatsApp = value => /^212[5-7]\d{8}$/.test(String(value || ''));
  const ready = config => config.ordersEnabled === true && !!(config.orderEndpoint || validWhatsApp(config.whatsapp)) && ['deliveryEstimate', 'returnsPolicy', 'warrantyPolicy', 'businessIdentity'].every(key => typeof config[key] === 'string' && config[key].trim()) && (validWhatsApp(config.whatsapp) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail || ''));
  const validate = values => {
    const errors = {};
    if (String(values.name || '').trim().length < 3) errors.name = 'كتب الاسم ديالك، على الأقل 3 حروف.';
    if (!normalizePhone(values.phone)) errors.phone = 'كتب نمرة مغربية صحيحة، بحال 0612345678.';
    if (String(values.city || '').trim().length < 2) errors.city = 'كتب المدينة ديالك.';
    if (total(values.quantity) === null) errors.quantity = 'اختار من باك واحد حتى 3 باكات.';
    return errors;
  };
  const orderText = order => [
    'طلب جديد — Electro Phone', 'الاسم: ' + order.customer.name,
    'الهاتف: ' + order.customer.phone, 'المدينة: ' + order.customer.city,
    'العنوان: ' + (order.customer.address || 'نكملوه فالتأكيد'),
    'عدد الباكات: ' + order.product.quantity + ' (' + order.product.quantity * 2 + ' مجموعات)',
    'المجموع: ' + total(order.product.quantity) + ' درهم', 'التوصيل مجاني · الدفع عند الاستلام'
  ].join('\n');
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizePhone, total, validWhatsApp, ready, validate, orderText };
    return;
  }
  const config = root.CONFIG || {};
  document.querySelectorAll('[data-setting]').forEach(element => {
    const value = config[element.dataset.setting];
    if (typeof value === 'string' && value.trim()) element.textContent = value;
  });
  document.querySelectorAll('[data-contact]').forEach(link => {
    if (validWhatsApp(config.whatsapp)) {
      link.href = 'https://wa.me/' + config.whatsapp;
      link.textContent = 'تواصل معانا فـ WhatsApp';
      link.hidden = false;
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail || '')) {
      link.href = 'mailto:' + config.contactEmail;
      link.textContent = config.contactEmail;
      link.hidden = false;
    }
  });
  if (ready(config)) document.querySelectorAll('[data-launch-notice]').forEach(element => { element.hidden = true; });
  const form = document.getElementById('order-form');
  if (!form) return;
  const submit = document.getElementById('submit');
  const submitLabel = document.getElementById('submit-label');
  const formError = document.getElementById('form-error');
  const result = document.getElementById('order-result');
  const availability = document.getElementById('availability');
  const enabled = ready(config);
  let busy = false;
  let completed = false;
  const started = Date.now();
  const eventId = root.crypto?.randomUUID ? root.crypto.randomUUID() : 'order-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  if (enabled) {
    submit.disabled = false;
    submitLabel.textContent = config.orderEndpoint ? 'أكّد طلبك — الدفع عند الاستلام' : 'كمّل الطلب عبر WhatsApp';
    availability.textContent = config.orderEndpoint ? 'غادي نتاصلو بيك باش نأكدو الطلب والعنوان قبل الإرسال.' : 'الطلب ما كيتصيفطش حتى تضغط إرسال فـ WhatsApp.';
  }
  const showError = text => {
    formError.textContent = text;
    formError.hidden = !text;
  };
  form.addEventListener('change', event => {
    if (event.target.name === 'quantity') document.getElementById('total').textContent = total(event.target.value);
  });
  ['name', 'phone', 'city'].forEach(key => {
    document.getElementById(key).addEventListener('input', () => {
      document.getElementById(key).removeAttribute('aria-invalid');
      document.getElementById(key + '-error').textContent = '';
    });
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!enabled || busy || completed) return;
    showError('');
    const values = Object.fromEntries(new FormData(form));
    const errors = validate(values);
    ['name', 'phone', 'city'].forEach(key => {
      document.getElementById(key + '-error').textContent = errors[key] || '';
      document.getElementById(key).setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
    });
    const firstInvalid = ['name', 'phone', 'city'].find(key => errors[key]);
    if (firstInvalid) { document.getElementById(firstInvalid).focus(); return; }
    if (errors.quantity) { showError(errors.quantity); return; }
    const payload = {
      customer: { name: values.name.trim(), phone: normalizePhone(values.phone), city: values.city.trim(), address: values.address.trim() },
      product: { id: 'pack2-earbuds', quantity: Number(values.quantity) },
      hp: values.website, elapsed_ms: Date.now() - started, event_id: eventId
    };
    if (!config.orderEndpoint) {
      const link = document.getElementById('whatsapp-send');
      link.href = 'https://wa.me/' + config.whatsapp + '?text=' + encodeURIComponent(orderText(payload));
      link.hidden = false;
      document.getElementById('result-title').textContent = 'باقي خطوة: صيفط الرسالة';
      document.getElementById('result-message').textContent = 'وجدنا ليك تفاصيل الطلب. حل WhatsApp من الزر لتحت واضغط إرسال. الطلب مازال ما تسجّلش عند المتجر.';
      result.hidden = false;
      result.focus();
      return;
    }
    busy = true;
    submit.disabled = true;
    const originalLabel = submitLabel.textContent;
    submitLabel.textContent = 'كنسجلو الطلب…';
    form.setAttribute('aria-busy', 'true');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(config.orderEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error('Order was not accepted');
      completed = true;
      form.hidden = true;
      availability.hidden = true;
      document.getElementById('result-title').textContent = 'تسجّل طلبك، شكراً على الثقة!';
      document.getElementById('result-message').textContent = 'غادي يتاصل بيك المتجر باش يأكد المعلومات. الطلب مازال ما تصيفطش، والدفع عند الاستلام.';
      document.getElementById('result-ref').textContent = typeof data.ref === 'string' ? 'رقم الطلب: ' + data.ref.slice(0, 40) : '';
      result.hidden = false;
      result.focus();
    } catch {
      showError('ما قدرناش نأكدو تسجيل الطلب. المعلومات باقية فهاد الصفحة؛ تأكد من الاتصال، وتواصل مع المتجر قبل إعادة المحاولة باش ما يتكرر الطلب.');
    } finally {
      clearTimeout(timer);
      busy = false;
      submit.disabled = completed;
      submitLabel.textContent = originalLabel;
      form.removeAttribute('aria-busy');
    }
  });
  const bar = document.getElementById('mobile-bar');
  if ('IntersectionObserver' in root) new IntersectionObserver(entries => {
    bar.classList.toggle('is-hidden', entries[0].isIntersecting);
  }, { threshold: 0 }).observe(document.getElementById('order'));
})(typeof window === 'undefined' ? globalThis : window);
