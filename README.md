# Electro Phone

A lightweight Darija/RTL landing page matching the orange, image-led reference at https://electro-phone-ads.vercel.app/, using artwork supplied in the attached ZIP. The centered 480px layout, image order and quantity bottom sheet follow that reference. Vanilla HTML, CSS and JavaScript; no build step or runtime dependencies. Product images come from the supplied archive and must be checked against actual inventory before sale.

## Run and verify

Node.js 20 or newer:

```sh
npm start        # local static preview on port 3000 (or PORT)
npm run check   # JavaScript syntax
npm test        # frontend rules and mocked backend tests
```

The preview serves only `public/`. It does not run Netlify Functions or send orders. Deploy to Netlify using `netlify.toml` to use the included function. Never publish the repository root: attachments, tests, setup scripts and server sources are not public assets.

## Structure

- `public/index.html`: responsive landing page and order form.
- `public/policies.html`: store, delivery, returns and privacy information.
- `public/assets/config.js`: public store settings; no secrets.
- `public/assets/app.js`: pricing, validation, accessible quantity dialog and honest submission states.
- `public/assets/policies.css`: policy-page presentation, separate from the reference landing design.
- `netlify/functions/order.js`: server-validated order storage in Google Sheets.
- `server/google-apps-script.gs`: authenticated Sheets receiver.
- `server/preview.js`: dependency-free static preview server.
- `tests/`: Node built-in test runner.

## Orders are deliberately disabled

The supplied archive did not include a business number or confirmed store policies. The preview clearly says orders are unavailable; it never invents a successful order. Pricing and quantity selection remain interactive.

Before launch, complete `public/assets/config.js` with verified identity, delivery time/coverage, returns conditions and costs, warranty terms (including an explicit no-warranty statement if appropriate), and a contact method. Complete the privacy disclosures in `public/policies.html`, including retention, delivery partner, data requests and applicable legal requirements. Review product specifications and replace artwork with actual product photos/video when available. The reference artwork includes “two for the price of one” and “5–6 hours” battery claims. These are preserved from the supplied design, not independently verified; confirm them or update the artwork before advertising. No testimonials have been invented. Contact details from the reference website have not been adopted as verified store configuration.

Choose one order destination:

### WhatsApp

Set `whatsapp` to the store's actual Moroccan international number, digits only, such as `2126XXXXXXXX`. Leave `orderEndpoint` empty. The form prepares a message and shows a link to WhatsApp; it does **not** claim that the message was sent or received.

### Netlify + Google Sheets

1. Create a Google Sheet, add the supplied Apps Script, and set its script property `SECRET` to a strong random secret.
2. Deploy the Apps Script as a web app running as the owner. Its receiver checks the shared secret.
3. Set Netlify environment variables `SHEETS_WEBHOOK_URL` and `SHEETS_SECRET`. Keep these out of public configuration and source control. Set `ALLOWED_ORIGIN` to the published site's origin.
4. Set `orderEndpoint` to `/.netlify/functions/order`. The endpoint takes priority over WhatsApp. Configure a real contact email or WhatsApp number too.
5. Test storage with a controlled order before advertising. The server, not the client, sets the price at 179 MAD per pack. Changing prices later requires updating the server, UI and tests together.

Finally set `ordersEnabled: true`. The client also checks for required store settings and contact details before enabling submission. This is a launch guard, not a substitute for reviewing the policies.

## Privacy and limitations

- No advertising pixels, analytics, localStorage drafts, fabricated stock countdowns or automatic offer popups.
- Google Fonts is the only third-party page resource; its privacy implications are disclosed.
- The API rate limit is best-effort per warm function instance, not distributed bot protection.
- Order storage is not idempotent. Following an uncertain network response, check with the store before retrying; the interface warns about duplicates.
- No real WhatsApp, Sheets or production deployment has been verified without store configuration. Local tests mock external storage.
- Add the real production domain and a verified social-share image URL before advertising; there are no fake domain placeholders in the page.
