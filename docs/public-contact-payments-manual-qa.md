# Public Contact Payments — Manual QA Charter

Manual test plan for public Paykit payments to Pubky contacts.

PR context:

- Android: synonymdev/bitkit-android#924
- iOS: synonymdev/bitkit-ios#531

## Scope

Verify that Bitkit can discover public payment endpoints from a Pubky profile/contact and route payments through the existing send flow.

Covered surfaces:

- Pay Contacts endpoint publishing.
- Payment from saved contact and non-saved Pubky.
- Payment via Add Contact, Contact Detail, QR scanner, paste/manual send flow.
- On-chain, Lightning/Bolt11, and combined public payment requests.
- Contact-tagged activity and contact activity screen.
- On-chain boosts (RBF/CPFP) preserving expected activity behavior.

## Preconditions

Run on both Android and iOS where possible.

Use staging/regtest builds unless explicitly testing mainnet. Mainnet Pubky profile creation may depend on current Pubky stack rollout status.

Recommended accounts/devices:

- **Wallet A / Sender**: funded wallet used to pay.
- **Wallet B / Recipient**: wallet with Pubky profile and Pay Contacts enabled.
- Optional **Wallet C / Non-contact recipient**: useful for testing payment to a Pubky that is not yet in Wallet A's contact list.

Funding recommendations:

- Sender has enough on-chain funds for on-chain sends and RBF/CPFP scenarios.
- Sender has an active Lightning channel and spending balance for Bolt11/contact Lightning payments.
- Recipient has completed Pubky profile creation.

## Setup Checks

### S1. Publish public endpoints

1. On Wallet B, create or restore a Pubky profile.
2. On first-time **Pay Contacts** screen, keep public payments enabled and continue.
3. If settings expose the Pay Contacts toggle, turn it off and on again.
4. Confirm no error toast appears.
5. If available, verify public endpoints on `payky.app` or equivalent tooling.

Expected:

- With Pay Contacts enabled, Wallet B publishes public payment endpoints.
- With Pay Contacts disabled, Wallet B does not publish endpoints or removes previously published endpoints.
- Toggling the setting is resilient if Lightning is not immediately ready, as long as on-chain endpoint publishing is possible.

### S2. Disabled recipient

1. On another recipient wallet/profile, disable Pay Contacts.
2. Try to pay that Pubky from Wallet A.

Expected:

- App does not offer a broken send flow.
- User sees clear unavailable/no payment methods messaging.

## Core Payment Matrix

Run the following combinations at minimum once on Android and once on iOS.

| Case | Contact state | Entry point | Payment method | Expected |
| --- | --- | --- | --- | --- |
| P1 | Saved contact | Contact Detail → Send | On-chain | Payment succeeds; activity is tagged to contact. |
| P2 | Saved contact | Contact Detail → Send | Bolt11/Lightning | Payment succeeds; activity is tagged to contact. |
| P3 | Saved contact | Contact Detail → Send | Combined/BIP21 | App chooses valid route or lets user choose; activity is tagged to contact. |
| P4 | Not in contacts | Add Contact flow | On-chain | User can pay public endpoint if supported by product; contact creation state stays correct. |
| P5 | Not in contacts | Add Contact flow | Bolt11/Lightning | User can pay public endpoint if supported; no contact is silently created unless explicitly saved. |
| P6 | Not in contacts | QR scanner with Pubky | Any available | Routes to Add Contact / Contact Detail as appropriate, then payment succeeds. |
| P7 | Not in contacts | Send → manual/paste Pubky | Any available | Routes to Pubky/contact payment flow, not invalid-address error. |
| P8 | Existing contact | Send → manual/paste Pubky | Any available | Routes to existing contact rather than Add Contact. |

For each successful payment, verify:

- Review screen shows contact name/pubky context.
- Amount and asset selection are correct.
- Swipe/confirm sends successfully.
- Main activity shows a sent payment with the expected amount.
- Contact activity screen shows the sent payment under the contact.
- Contact context is not leaked to the next unrelated payment.

## Detailed Test Cases

### T1. Saved contact, on-chain payment

1. Wallet A adds Wallet B as a contact.
2. Open Wallet B contact detail.
3. Tap Send/Pay.
4. Choose or confirm on-chain route.
5. Enter a small amount.
6. Send.
7. Mine/confirm if needed.

Expected:

- Payment succeeds.
- Wallet A main activity shows `Sent to {contact name}` or equivalent contact title where supported.
- Contact Activity for Wallet B includes the sent on-chain payment.
- Wallet B receives the on-chain payment.

### T2. Saved contact, Lightning payment

1. Ensure Wallet A has spending balance and Wallet B has public Lightning endpoint.
2. Open Wallet B contact detail.
3. Tap Send/Pay.
4. Choose or confirm Lightning route.
5. Send a small amount.

Expected:

- Payment succeeds.
- Activity is tagged to Wallet B.
- If payment goes pending, pending screen and later success/failure keep the correct contact context.
- Retrying or sending a later unrelated payment does not reuse stale Wallet B contact context.

### T3. Saved contact, combined public request

1. Use a recipient with both on-chain and Lightning endpoints available.
2. Start payment from contact detail.
3. Check default method and asset switch behavior.
4. Send via default route.
5. Repeat and switch to the other available route if UI allows.

Expected:

- Route priority matches product expectations.
- Asset switching does not lose contact context.
- Activity is tagged correctly for both routes.

### T4. Add Contact screen, Pubky not saved

1. On Wallet A, open Contacts → Add Contact.
2. Enter/paste Wallet C pubky.
3. Let the profile/payment details load.
4. If the Send/Pay button is present by design, tap it.
5. Complete on-chain and Lightning payment variants where endpoints exist.
6. Return to Contacts.

Expected:

- Payment can be made to public endpoints if product accepts paying non-contacts.
- User is not forced to save contact unless required by design.
- If contact is not saved, Contacts list remains unchanged after payment.
- Add Contact copy matches design, especially wording around public vs private payments.

### T5. QR scanner Pubky route

1. Display or generate Wallet B Pubky QR.
2. On Wallet A, open scanner from Send or global scan.
3. Scan Wallet B pubky.

Expected:

- If Wallet B is saved, app opens Wallet B contact detail.
- If Wallet B is not saved, app opens Add Contact / payment-capable Pubky flow.
- Payment from the routed screen succeeds and is tagged only when a contact relationship exists or when product intentionally tags public Pubky payments.

### T6. Send flow manual/paste Pubky route

1. On Wallet A, open Send.
2. Choose manual recipient entry.
3. Paste Wallet B pubky.
4. Continue.

Expected:

- Saved contact routes to Contact Detail/payment flow.
- Non-saved pubky routes to Add Contact/payment flow.
- Own pubky routes to own profile or shows self-add/self-pay guard, according to product decision.
- Invalid pubky remains blocked with clear validation.

### T7. Recipient without public endpoints

1. Use a Pubky profile with Pay Contacts disabled or no endpoints.
2. Try payment from Contact Detail, Add Contact, QR scanner, and Send/manual.

Expected:

- No crash or stuck loading.
- Clear message that payment methods are unavailable.
- Contact can still be added/viewed if profile exists.

### T8. Endpoint lifecycle

1. Wallet B enables Pay Contacts.
2. Wallet A confirms payment methods are available for Wallet B.
3. Wallet B disables Pay Contacts.
4. Wallet A refreshes contact/profile or restarts app.
5. Try payment again.

Expected:

- Disabled endpoints stop being offered after refresh/reload.
- Re-enabling endpoints makes payment available again.
- No stale invoice/address is used after disable.

### T9. Existing wallet upgrade path

1. Use an existing wallet/profile created before public Paykit endpoints existed.
2. Enable Pay Contacts.
3. Try receiving public contact payments.
4. Add Lightning channel after profile already exists.
5. Refresh/restart.
6. Try Lightning contact payment.

Expected:

- Existing profile can publish endpoints after upgrade.
- On-chain works before Lightning is ready.
- Lightning endpoint appears after channel/spending balance is available.

## Activity Checks

For each successful payment type:

1. Check Home activity row.
2. Open full Activity list.
3. Open Contact Activity from contact detail.
4. Open payment detail.

Expected:

- Sent public contact payments show contact-aware title where supported.
- Contact Activity contains the matching sent payment.
- Received public payments may not show `Received from {name}` if sender identity is not known for public payments; confirm copy/product expectation.
- Replaced/boosted transactions do not appear as duplicate stale entries in Contact Activity.
- Pending → success, pending → failure, and retry flows keep or clear contact context correctly.

## Boost / Replacement Checks

### B1. RBF on contact on-chain send

1. Create a low-fee on-chain payment to a contact.
2. Before confirmation, open activity details.
3. Use RBF boost.
4. Confirm boosted transaction.

Expected:

- Boost succeeds.
- Main Activity shows boosted/replaced state correctly.
- Contact Activity shows the final/relevant payment only.
- Contact context remains attached after replacement.

### B2. CPFP involving contact payment

1. Create an unconfirmed incoming or outgoing transaction that allows CPFP.
2. Use CPFP boost from activity details.
3. Confirm boosted transaction.

Expected:

- Boost succeeds.
- Contact-related activity does not duplicate or lose context.
- Parent/child transaction details remain understandable.

### B3. Failed/pending contact payment context

1. Start a contact payment likely to go pending or fail.
2. Without closing the send sheet, retry or start a different payment to a normal address/invoice.

Expected:

- Stale contact context is cleared or moved correctly.
- The unrelated payment is not tagged to the previous contact.

## Negative / Edge Cases

- Recipient pubky has malformed endpoint document.
- Endpoint document has only on-chain endpoint.
- Endpoint document has only Lightning endpoint.
- Lightning invoice generation fails.
- On-chain address is unavailable.
- Endpoint fetch times out or is offline.
- Wallet has no on-chain balance.
- Wallet has no spending balance.
- User disables Pay Contacts while another wallet has the contact detail screen open.
- Contact is deleted after a payment; historical activity remains readable.
- Contact is renamed locally after payment; activity title uses the expected current or historical name per product decision.
- Wallet reset/sign-out removes published endpoints best-effort and never blocks local wipe.

## Suggested Future E2E Coverage

Start small and keep these behind a Pubky/contact-payments tag until stable.

1. **Public contact on-chain payment happy path**
   - Wallet A funded, Wallet B profile with Pay Contacts enabled.
   - Add Wallet B as contact.
   - Pay Wallet B on-chain from Contact Detail.
   - Verify send success and contact activity row.

2. **Public contact Lightning payment happy path**
   - Same setup, with Wallet A spending balance.
   - Pay Wallet B via Lightning from Contact Detail.
   - Verify send success and contact activity row.

3. **Pubky routing from Send/manual**
   - Paste saved contact pubky → opens existing contact payment route.
   - Paste unknown pubky → opens Add Contact/payment route.
   - Invalid/self pubky remains blocked.

4. **Endpoint disabled**
   - Recipient disables Pay Contacts.
   - Sender refreshes and sees payment unavailable.

5. **RBF contact payment**
   - Create on-chain contact payment.
   - Boost with RBF.
   - Verify final activity state and contact activity do not show stale duplicate replacement rows.

6. **Contact context isolation**
   - Start contact payment, force pending/failure if possible.
   - Send unrelated payment.
   - Verify unrelated activity is not tagged to the contact.

## Notes / Known Product Questions

- Public contact payments are not private payments. If copy says both users must add each other to pay privately, verify whether public-payment behavior needs separate copy.
- If Send/Pay is shown on Add Contact before saving, confirm design/product acceptance.
- For public incoming payments, sender identity may not be knowable; do not expect `Received from {name}` unless private payment metadata exists.
- Mainnet demo testing should wait until mainnet Pubky profile creation and Paykit endpoint publishing are available and stable.
