// Sends a Ko-fi "Shop Order" test webhook to the deployed function (or a local one).
//
//   node tools/kofi-webhook-test.mjs                          -> "Unlock 25 songs" x1 to https://game-dj.vercel.app/api/kofi
//   node tools/kofi-webhook-test.mjs --variant "Unlock 10 songs" --qty 2
//   node tools/kofi-webhook-test.mjs --url http://localhost:3000/api/kofi
//   node tools/kofi-webhook-test.mjs --email you@example.com   (the e-mail that /thanks will ask for)
//   node tools/kofi-webhook-test.mjs --tx same-id               (send twice: the second must say "duplicate")
//   node tools/kofi-webhook-test.mjs --bad-token                (must answer 401)
//
// The token comes from private/.env (KOFI_VERIFICATION_TOKEN) and is never printed.
import fs from "node:fs";
import crypto from "node:crypto";

const arg = (name, fallback) => { const i = process.argv.indexOf("--" + name); return i > -1 ? process.argv[i + 1] : fallback; };
const flag = (name) => process.argv.includes("--" + name);

let token = "";
try { token = /^KOFI_VERIFICATION_TOKEN=(.*)$/m.exec(fs.readFileSync(new URL("../private/.env", import.meta.url), "utf8"))?.[1]?.trim().replace(/^"|"$/g, "") ?? ""; } catch {}
if (!token && !flag("bad-token")) throw new Error("KOFI_VERIFICATION_TOKEN is empty in private/.env");

const url = arg("url", "https://game-dj.vercel.app/api/kofi");
const tx = arg("tx", crypto.randomUUID());
const payload = {
  verification_token: flag("bad-token") ? "wrong-token" : token,
  message_id: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
  type: "Shop Order",
  is_public: true,
  from_name: "Test Buyer",
  message: null,
  amount: "5.00",
  url: "https://ko-fi.com/Home/CoffeeShop?txid=" + tx,
  email: arg("email", "test.buyer@example.com"),
  currency: "USD",
  is_subscription_payment: false,
  is_first_subscription_payment: false,
  kofi_transaction_id: tx,
  shop_items: [{ direct_link_code: "test000000", variation_name: arg("variant", "Unlock 25 songs"), quantity: Number(arg("qty", "1")) }],
  tier_name: null,
};

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ data: JSON.stringify(payload) }),
});
console.log(res.status, await res.text());
