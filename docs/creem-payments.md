# Creem one-time credit top-up (test first)

DeAIfy supports `PAYMENT_PROVIDER=creem` alongside the existing Xunhu integration. You need an approved Creem account, at least one *one-time* product per available plan, and a publicly reachable HTTPS API URL.

1. In the Creem dashboard, create **one-time** USD/EUR products (tax inclusive). Take each `prod_...` ID and exact price in cents from the product settings. Do not configure subscriptions or discounts for these products.
2. Configure backend `.env.commercial` (or choose Creem in `bash scripts/setup.sh`):

   ```dotenv
   PAYMENT_PROVIDER=creem
   CREEM_MODE=test
   CREEM_API_KEY=your_test_api_key
   CREEM_WEBHOOK_SECRET=your_test_webhook_secret
   CREEM_PRODUCTS_JSON='{"plan-starter":{"productId":"prod_YOUR_TEST_ID","amountMinor":500,"currency":"USD"}}'
   PAYMENTS_ENABLED=true
   MERCHANT_APPROVED=false
   ```

   The JSON keys are the DeAIfy plan IDs, amounts are minor currency units, and prices must exactly match active Creem products. Other plans show as unavailable. Existing CNY prices/discounts in the admin panel continue to apply to Xunhu only. Creem products must be updated explicitly when you want to change USD/EUR prices. The API validates the configured fixed-price product at checkout.
3. In Creem **Developers → Webhooks**, register:

   `https://YOUR_API_DOMAIN/api/payments/creem/webhook`

   Enable `checkout.completed`, `refund.created`, and `dispute.created`; use the webhook secret of the matching environment.
4. Start/redeploy API containers after backing up the database; the non-destructive schema bootstrap extends existing orders. The browser's checkout link takes users to Creem. Only a verified completed payment with matching user, product, order, currency and amount grants credits. Duplicate events are idempotent. Refunds and chargebacks revoke the credited amount; a mismatch is rejected for manual investigation.
5. Complete Creem test checkout, webhook replay and refund tests and inspect order and wallet ledger. For production, obtain approval for your specific digital credit business; change `CREEM_MODE=live`, switch to **live** product IDs/API key/webhook secret, set `MERCHANT_APPROVED=true`, and re-enable payment only after successful live validation. Do not commit credentials.

The redirect after a purchase is for user convenience; **only the signed server-to-server webhook can settle an order**. Retain old Xunhu credentials temporarily when switching so delayed historic Xunhu payment/refund callbacks remain reconcilable. Rate limits and HMAC signature checking are enabled. Creem webhooks may not come from fixed source IPs: do not apply interactive bot challenges to this route.

API reference: https://docs.creem.io/skills/creem-api/REFERENCE
Webhooks: https://docs.creem.io/skills/creem-api/WEBHOOKS
