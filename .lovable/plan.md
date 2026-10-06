# Switch deposits and withdrawals to BoundlessPay

All four money flows move to BoundlessPay. The old providers (Payaza, Flutterwave, NOWPayments, our own BSC addresses) get switched off in the app, but their code and records stay so old transactions still show and you can switch back. We build against your **test** key first. Going live means swapping in the live key.

## What users will see
- **Naira deposit:** each user gets their own permanent Naira bank account from BoundlessPay. Any transfer to it credits their balance in USD at the current rate.
- **Crypto deposit:** each user gets a permanent BoundlessPay USDT (BEP20) address. Coins sent there credit automatically.
- **Naira withdrawal:** the user picks a bank and types an account number. The account name is checked, then the money is paid out.
- **Crypto withdrawal:** the user enters a USDT address and the money is sent on-chain.
- The current limits, the 1% fee, the KYC checks, PIN/security checks and debt rules all stay the same.

## What admins will see
- A new "BoundlessPay" section on the Reconciliation page lists deposits and payouts, matches them with our records, and has a "re-check" button for stuck ones.
- A provider switch in Admin Settings, so you can turn BoundlessPay or the old providers on or off for each flow.

## Steps
1. Save your BoundlessPay test key and webhook signing secret securely.
2. Build a shared BoundlessPay connector for backend functions: test vs live base URL, idempotency keys, error handling.
3. Deposits: issue Naira virtual accounts and blockchain deposit addresses per user, stored on our side. A webhook receiver checks signatures, ignores duplicates, and credits balances through the existing logged balance helper.
4. Withdrawals: switch request-withdrawal and the Naira withdrawal function to BoundlessPay payouts (bank list, account name check, payout) and on-chain withdrawals. Funds are held on request, and the hold is released or reversed when the webhook says the payout succeeded or failed.
5. Change the deposit/withdraw screens and the partner API deposit endpoint to use the new flow. Hide the old provider options with the switch.
6. Add the admin reconciliation section and the provider switch.
7. Test end-to-end using BoundlessPay's test "simulate deposit" call.

## Technical details
- New tables: `boundlesspay_accounts` (user_id, kind naira_va|crypto_address, external_id, account/address details, status), plus `boundlesspay_events` for webhook idempotency. Every table gets GRANTs and RLS, and users read only their own rows.
- `transactions.payment_provider = 'boundlesspay'`, with the external reference stored for matching.
- Edge functions: `boundlesspay-account` (issue/fetch), `boundlesspay-webhook` (signature-verified, verify_jwt off), `boundlesspay-withdraw`, `boundlesspay-reconcile`, `_shared/boundlesspay.ts`.
- Secrets: `BOUNDLESSPAY_API_KEY`, `BOUNDLESSPAY_WEBHOOK_SECRET`, `BOUNDLESSPAY_ENV`.
- Feature toggles in `feature_toggles` decide which provider each flow uses. The BSC poller and NOWPayments functions stay deployed but stop being used.
- Open risk: the exact webhook event names and payload fields get confirmed from the API reference while building.
