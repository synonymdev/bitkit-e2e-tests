# Pubky profile & contacts — manual E2E charter

Charter for QA around profile creation, Pubky Ring import, and contacts. Use alongside the WebdriverIO `@pubky_profile` specs: keep high-value stable flows automated and use the remaining checklist for manual / exploratory coverage while the feature is landing.

PR context: `bitkit-android#824`, `bitkit-ios#476`.

## Preconditions

- **Build/network**: Match the PR under test. The current build talks to staging Pubky (`homegate.staging.pubky.app`, `staging.pubky.app`) regardless of flavor; switching to production `pubky.app` is a known TODO for mainnet.
- **Homegate dependency**: "Create profile from scratch" calls `POST https://homegate.staging.pubky.app/ip_verification`. If it returns 4xx (e.g. 404), the create-from-scratch path is blocked until the service or app config is fixed — verify the endpoint is healthy before starting this charter.
- **Pubky Ring**: Several steps need a physical device or simulator where Ring is (or is not) installed. Simulator may not fully mirror App Store install behavior for the "not installed" path.
- **Deterministic identity**: Pubky keys are derived from the wallet seed. Wiping and restoring the same seed yields the same pubky; creating a fresh wallet yields a different pubky.
- **Avatar fixtures**: Put test images under `test/fixtures/` (e.g. `bob.jpg`, `alice.png`), then push them into the running **Android emulator** and **iOS Simulator** Photos library:

  ```bash
  ./scripts/push-fixture-media-to-devices.sh
  ```

  With no arguments the script imports every `*.jpg`, `*.jpeg`, `*.png`, `*.heic`, `*.webp` in `test/fixtures/`. You can also pass explicit paths. Requires a booted Android device/emulator (`adb`) and a booted iOS Simulator (`xcrun simctl addmedia`). Use `ANDROID_SERIAL` if multiple Android devices are connected; set `SKIP_ANDROID=1` or `SKIP_IOS=1` to run one side only.

Run the same checklist on **Android** and **iOS** where the feature exists (labels may differ slightly).

### Terminology

- **Delete Profile** (`profile__delete_profile` / `profile__delete_label`): wipes profile data on the homeserver for this pubky. The pubky itself is seed-derived and unchanged; a new profile can be created for it later. **This is the only profile-removal action reachable from the normal Profile UI — it lives inside the Edit Profile screen.**
- **Disconnect** (`profile__sign_out`): local sign-out recovery action. **Not shown in the normal Profile view.** It surfaces only when the Profile screen lands in the empty / failed-to-load state (e.g. session expired, homeserver unreachable), next to a Retry button. Confirming clears the local session so the user can reconnect.

---

## A. No profile — navigation & gating

With no profile created yet, every entry point should funnel into the choice screen (Create / Import with Ring).

1. Fresh wallet, **no profile** — tap the header **profile button** (top-right) → `ProfileIntro` → Continue → `PubkyChoice` (Create + Import options).
2. Drawer → **Contacts** → `ContactsIntro` → Continue → `PubkyChoice`.
   - If you have already dismissed `ProfileIntro` in this session, `ContactsIntro` should still be shown the first time.
3. Drawer → **Profile** → goes straight to `PubkyChoice` (no intro once either intro has been seen).
4. Close drawer / back out from any of the above → returns to wallet home without leaving stale state.

> **Spec** (`test/specs/pubky-profile.e2e.ts`): `@pubky_profile_1` covers this.

---

## B. Create profile from scratch — full loop

### B.1 Create profile

1. From `PubkyChoice` → **Create profile** → name form.
2. With an **empty / whitespace-only** name, **Continue is disabled** on both platforms.
3. Enter a name → Continue becomes enabled → tap Continue → success toast, navigates to the **Pay Contacts** onboarding screen.
4. On Pay Contacts screen, toggle "Share payment data and enable payments with contacts" (if visible) → continue / close → land on profile/wallet.
5. Open Profile → name, avatar placeholder initial, and truncated pubky are shown.

> **`@pubky_profile_2`** drives `createProfile`: (1)–(3) and the transition to **Pay Contacts**; Save stays disabled with an empty name (asserted before typing). (4) default path leaves the Pay Contacts toggle on and taps Continue. (5) checks name and pubky on the profile screen; it does not assert **avatar** placeholder/initials.

### B.2 Pay Contacts onboarding

1. First time after profile creation → **Pay Contacts** screen is shown (headline: "Let your contacts pay you", toggle + Continue / Skip).
2. Accepting / skipping both land safely on the wallet or profile screen.
3. Re-entering Profile after completing onboarding should **not** re-show the onboarding screen.

> **`@pubky_profile_2`**: (1)–(2) are covered by the same `createProfile` hand-off (waits for `PayContactsContinue`, then profile). (3) is **implicit** in the rest of the spec (Profile opened many times, Pay Contacts is not expected again); a dedicated “second session / cold path” check is not in this file.

### B.3 Edit own profile

1. Profile → Edit → update **name**, **Notes** (label is `NOTES`), and **links** → Save.
2. Changes persist after leaving the screen and after app restart.

> **`@pubky_profile_2`** covers edit, then persist after **terminate/relaunch** and after **wallet restore** (same seed); same **pubky** after each. Later it removes a link and tag, saves, and verifies. Avatar and limit edge cases are not in that spec.
3. Avatar:
   - Pick an image from the Photos library → shown as avatar → persists after restart.
   - Remove avatar → falls back to the initial placeholder.
4. Character limits (if enforced by the UI) prevent oversize inputs without crashing.
5. **Delete Profile** lives at the bottom of this Edit screen (the only entry point in the normal UI). Covered by B.8.

### B.4 Add contact

1. Contacts → **Add contact** → paste a valid pubky → Continue → contact is added; opening detail shows the remote profile snapshot (name, image, links).
2. Scan-QR path (if exposed): scan a pubky QR → same flow.
3. **Invalid / malformed pubky** → clear inline error, no crash, Continue stays disabled or blocks submit.
4. **Paste from clipboard** button on iOS works without corrupting the value; whitespace is trimmed.
5. **Self-add guard**: pasting your own pubky shows an explicit error (Android string: `contacts__add_error_self`); contact is **not** created.
6. **Duplicate add** (same pubky already in contacts) → de-duplicated or clear message.

> **`@pubky_profile_2`** adds one staging contact after editing the profile, then verifies the row persists after app relaunch and wallet restore. **`@pubky_profile_3`** covers malformed pubky and self-add inline validation, then adds both staging contacts. Scan-QR, paste-from-clipboard, duplicate-add handling, and full remote snapshot assertions (avatar/links) remain manual.

### B.5 Edit contact (local snapshot)

1. Contacts → open a contact → Edit.
2. Edits to **Notes** and any local fields **persist locally** and **do not** update the remote Pubky profile of that contact — this is a local snapshot.
3. Name field behavior: verify whether the app allows renaming or is display-only; whichever is shipped should match across Android and iOS.
4. Manual refresh / pull-to-refresh (if present) re-fetches the remote snapshot; local Notes are preserved.

> **`@pubky_profile_4`** creates Wallet A, creates Wallet B, adds Wallet A as a contact on Wallet B, edits Wallet A's contact name/notes on Wallet B, verifies the edited contact detail locally, then restores Wallet A and verifies Wallet A's own profile is unchanged. Manual refresh / pull-to-refresh behavior and local note preservation after refresh are not automated.

### B.6 Contacts list

1. Header: single flat **CONTACTS** section header (no A/B/C alphabetical section headers — this was the Figma-compliant design).
2. "My profile" row is shown at the top when a profile exists.
3. Tapping a contact opens detail; tapping "My profile" opens own profile.
4. Empty state (profile exists, no contacts) shows the empty copy and an Add-contact CTA.

> **`@pubky_profile_2`** / **`@pubky_profile_3`** verify contact rows can be found by `Contact_<pubkey>`. **`@pubky_profile_3`** also verifies rows are gone after delete. Header copy, `ContactsMyProfile`, tapping My Profile, and empty-state copy remain manual.

### B.7 Delete contact

1. Contacts → open a contact → Edit → Delete Contact → confirmation → **Yes, Delete**.
2. Success toast appears ("Contact deleted") and the contact row is removed.
3. Deleting the last contact returns to the empty contacts state without a stale header/list state.
4. Error path: if delete fails, show a clear error and keep the contact available.

> **`@pubky_profile_3`** deletes both staging contacts, waits for `ContactDeletedToast`, and verifies each contact row is absent. Delete failure/error handling remains manual.

### B.8 Delete profile (homeserver wipe)

1. Profile → Edit → scroll to the bottom → **Delete Profile** → confirmation ("Delete Profile?" / "This will delete your current Pubky profile data. You can create a new profile for this pubky later.") → confirm.
2. After delete: gated back to `PubkyChoice` (same as **section A**).
3. Creating a new profile from the same wallet uses the **same pubky** (seed-derived), with **fresh** remote data.
4. Error path: if homeserver is unreachable, a clear error toast appears (Android: `profile__delete_error`); app does not lock up.

> **`@pubky_profile_2`** also ends with delete → recreate and asserts the same seed-derived pubky. Homeserver error path in (4) is manual.

### B.9 Wipe wallet

1. Settings → reset/wipe wallet → onboard a **new seed** → no profile, different pubky → repeat **section A**.
2. Onboard the **same seed** on a fresh install → profile and contacts should be recovered from the homeserver (if not Deleted first).

> **`@pubky_profile_2`** exercises **(2) in part**: it runs the standard E2E **backup → `restoreWallet(seed)`** flow (after profile and one contact exist), then checks profile **details**, **pubky copy**, and the added contact row still match. It is not a full “fresh install from IPA” story.

---

## C. Import with Pubky Ring

### C.1 Ring not installed

1. From `PubkyChoice` → **Import with Pubky Ring** → expect the download / App Store prompt.
2. Cancel / back returns to a safe screen (choice or previous), no dangling state.

### C.2 Ring installed — happy path

1. Complete auth in Ring → return to Bitkit.
2. Profile imported; Pay Contacts onboarding may be shown on first success (same as B.2).
3. After import, contacts list reflects the Ring state (see C.3).

### C.3 Import contacts selection

1. After auth, the **Import overview / select** screens appear (Android: `ContactImportOverviewScreen`, `ContactImportSelectScreen`).
2. **Import all** → all remote contacts added locally.
3. **Import subset** (if partial selection is supported) → only selected contacts appear locally; unselected ones are not added.
4. **Skip** (if allowed) → profile imported, zero contacts; you can add manually later.

### C.4 PubkyAuth approval / cancel

1. Approve in Ring → return with success; capabilities requested match what the app announced (`/pub/bitkit.to/:rw`, `/pub/staging.pubky.app/:r` for staging builds).
2. **Cancel** in Ring → return to Bitkit choice screen; no crash, no partial profile, retry works.
3. Kill Ring mid-auth / background Bitkit → on resume, state is consistent (either success or clean cancel).

### C.5 Deep link / handoff

1. Trigger `pubkyauth://` flow from a system share-sheet or deep link if exposed; verify it lands in Bitkit and continues the flow.

---

## D. Profile empty / failed-to-load recovery

Reproduce by simulating an unreachable homeserver, expired session, or forced load failure (e.g. toggle airplane mode before opening Profile).

1. Open **Profile** → when loading finishes without a profile, the empty state is shown with: the `profile__empty_state` / `profile__session_expired` message, a **Retry** button, and a **Disconnect** button (`profile__sign_out`).
2. **Retry** with connectivity restored → profile loads into the normal view; Disconnect is no longer visible.
3. **Disconnect** (empty state only) → confirmation ("Disconnect Profile" / "...You can reconnect at any time.") → confirm → profile cleared locally, entry points behave like **section A** again.
4. Reconnect from `PubkyChoice` with the same wallet → same pubky, same remote profile restored (name, Notes, avatar, links); verify contacts are also re-synced.
5. Confirm Disconnect is **not** visible from the normal Profile view when a profile is successfully loaded — the only profile-removal action there is **Delete Profile** inside Edit.

---

## E. Data lifecycle — matrix

Use this table to verify persistence expectations. Fill in observed behavior if it differs from the stated expectation.

| Action                                  | Seed | Pubky | Remote profile | Local contacts | Local notes on contacts |
| --------------------------------------- | ---- | ----- | -------------- | -------------- | ----------------------- |
| Disconnect from empty state + reconnect | same | same  | preserved      | re-synced      | preserved               |
| Delete profile + recreate (same wallet) | same | same  | wiped then new | tbd — verify   | tbd — verify            |
| Wipe wallet, restore same seed          | same | same  | preserved      | re-synced (`@pubky_profile_2`) | tbd — verify            |
| Wipe wallet, new seed                   | new  | new   | none           | none           | none                    |
| App reinstall, same seed                | same | same  | preserved      | re-synced (`@pubky_profile_2`) | tbd — verify            |

---

## F. UI / copy compliance

- Profile edit sheet: **NOTES** (not "Bio") on both platforms.
- Normal Profile view actions: **Edit / Copy / Share** only (no Disconnect, no Delete).
- **Delete Profile** is reached only from inside the Edit Profile screen.
- **Disconnect** is shown only in the Profile empty / failed-to-load state next to Retry.
- Contacts list: single **CONTACTS** section header (no alphabetical A/B/C splits).
- Create profile: placeholder and hint copy match Figma; Continue button disabled while name is empty/whitespace on both platforms.
- Pay Contacts onboarding: headline "Let your\ncontacts\npay you" (with accent on "pay you").
- All surfaces avoid hard-coded strings — verify localization by switching app language if supported.

---

## G. Extra cases / regression hooks

- Rotate device / change theme (dark/light) on every surface → no layout breakage.
- Offline → open Profile and Contacts → cached data, no crash; reconnect triggers refresh.
- Large avatar image (>5 MB) → either rejected cleanly or downscaled; no OOM / crash.
- Long name / very long Notes / many links → truncation or scroll, no overflow.
- High-DPI and small-screen devices (e.g. iPhone SE, small Android) → no overlap on choice / profile / contact detail screens.

---

## H. Automation strategy

- **Spec**: `test/specs/pubky-profile.e2e.ts` — covers profile creation/edit/delete, contact add/delete/edit basics, and persistence. Ring import remains manual until reliable automation exists. How/whether it runs in automation is a pipeline concern (`AGENTS.md`); this section only describes the spec’s intent.
- **Isolation**: `beforeEach` uses `reinstallApp()` and `completeOnboarding()` so a single `ciIt` can be run alone via `--mochaOpts.grep "@pubky_profile_N"`.
- **What the tests do**:
  - `@pubky_profile_1` — section A gating (no profile).
  - `@pubky_profile_2` — create → copy/verify pubky → update profile → add one staging contact → `launchFreshApp`, verify profile + contact → **wait for backup, restore wallet from seed**, verify profile + pubky + contact → remove link and tag → delete profile → create profile again, same pubky.
  - `@pubky_profile_3` — invalid pubky and self-add validation → add both staging contacts → delete both contacts and verify rows are absent.
  - `@pubky_profile_4` — Wallet A profile edited as a contact on Wallet B remains a local contact edit; restoring Wallet A verifies its own profile was not changed.
- **Known gaps in automation**: Ring import, avatar add/remove, scan-QR contact add, paste-from-clipboard contact add, duplicate-add behavior, contacts list header/My Profile row/empty copy, contact refresh behavior, profile/contact field-boundary behavior, and network/error paths.
- **Tags**: suite `@pubky_profile`; tests `@pubky_profile_1`, `@pubky_profile_2`, …; reserve e.g. `@pubky_ring_required` if you add Ring-specific specs later.
- **Use `ciIt()`** instead of `it()` in this suite so it matches the repo’s `ci_run_*` / lockfile retry pattern when you wire runs up.
- Shared test IDs: **H.1** below. Implementation lives under `test/helpers/` next to other E2E specs.

### H.1 Cross-platform test IDs (`testTag` / `accessibilityIdentifier`)

Use the **same string** on Android and iOS so specs stay platform-agnostic (`elementById` in helpers).

| Area                   | IDs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header / drawer        | `ProfileButton`, `DrawerContacts`, `DrawerProfile`, `DrawerWallet`, … (existing app IDs)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Intros                 | `ProfileIntro`, `ProfileIntro-button`, `ContactsIntro`, `ContactsIntro-button`                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Pubky choice           | `PubkyChoiceCreate`, `PubkyChoiceImport`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Create profile         | `CreateProfileAvatar`, `CreateProfileUsername`, `CreateProfileSave`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Pay contacts           | `PayContactsToggle`, `PayContactsContinue`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Profile (view)         | `ProfileEdit`, `ProfileCopy`, `ProfileShare`; empty/error: `ProfileRetry`, `ProfileEmptySignOut` (iOS)                                                                                                                                                                                                                                                                                                                                                                                                                |
| Profile (presentation) | **`ProfileViewName`**, **`ProfileViewNotes`** (own profile only; `CenteredProfileHeader` passes tags on **Profile** screen). **`ProfileQRCode`** is read in E2E via **`getUriFromQRCode()`** in `test/helpers/actions.ts` (shared with receive flows). Links: **`ProfileLinkLabel_0`**, **`ProfileLinkValue_0`**, … (index matches link order). Tags section header: **`ProfileViewTagsHeader`**. Each tag chip text: **`Tag-<tagtext>`** (e.g. `Tag-ere`) on the label `Text` / `BodySSB`. |
| Edit profile           | `EditProfileAvatar`, `ProfileEditName`, `ProfileEditBio`, `ProfileEditAddLink`, `ProfileEditLink_0` (URL field), `ProfileEditLinkRemove_0` (trash on that row), …, `ProfileEditAddTag`, remove chip `Tag-<tag>-delete`, `ProfileEditDelete`, **`ProfileEditCancel`**, **`ProfileEditSave`**                                                                                                                                                                                                                            |
| Add link sheet         | `AddLinkLabel`, `AddLinkUrl`, `AddLinkSave`, `AddLinkSuggestions`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Add tag sheet          | `AddTagInput`, `AddTagSave`, `AddTagSuggestions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Contacts list          | `ContactsAddButton`, `ContactsEmptyAddButton`, `ContactsMyProfile`, `Contact_<pubkey>`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Add contact            | `AddContactPubkyField`, `AddContactPaste`, `AddContactScanQR`, `AddContactAdd`, `AddContactRetry`, `AddContactDiscard`, `AddContactSave`                                                                                                                                                                                                                                                                                                                                                                             |
| Contact detail         | `ContactViewName`, `ContactViewNotes`, `ContactCopy`, `ContactShare`, `ContactEdit`, `ContactDelete`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Toasts                 | `ProfilePubkyCopiedToast`, `ProfileUpdatedToast`, `ContactSavedToast`, `ContactUpdatedToast`, `ContactDeletedToast`                                                                                                                                                                                                                                                                                                                                                                                                    |

Ring-only / iOS-only extras (when automating C.x): `PubkyChoiceCancelRing`, `PubkyRingAuthorize`, `PubkyRingCancelAuth`, `PubkyRingDownload`.

Contacts intro note: after a profile exists, first opening **Contacts** shows `ContactsIntro`; its `ContactsIntro-button` now behaves as an add-contact entry point. `ContactsEmptyAddButton` appears only after the intro is gone and the user has zero contacts.
