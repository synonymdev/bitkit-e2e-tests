# Deriving a release sanity suite

This is the shared Bitkit method for planning pre-release sanity checks across Android and iOS. Each release gets a fresh coverage assessment: a small production payment smoke plus checks for material risks that existing evidence does not adequately cover. The result is a test plan, not a release-readiness verdict.

Agents can use [release-sanity](../.agents/skills/release-sanity/SKILL.md) or the shared [/release-sanity command](../.agents/commands/release-sanity.md). The [3.1.0 worked example](release-qa/3.1.0-example.md) shows selection and reuse decisions; its cases and exceptions are not standing requirements.

## 1. Pin the release and collect evidence

Record the previous released tag and SHA, candidate app SHA/build number for each platform, distribution source, and the resolved E2E checkout SHA used by each relevant run. A moving branch name alone is insufficient. Record test build/network differences from the distributed candidate.

Inspect:

- The release diff, changelog, constituent PRs, dependency/backend/configuration changes and platform differences.
- Applicable build/unit, integration, lint/translations, native UI, local/staging E2E and migration workflows on the candidate revisions. Discover the actual matrix from pinned workflow files rather than assuming every repository has every gate.
- The assertions, fixtures, helpers, selectors/tags and feature flags that determine what ran. A test name or source file alone does not establish coverage.
- Latest PR reviews, comments and device evidence, including reviews posted by automation. Older unchecked boxes can be superseded by later recorded runs.

Distinguish first-pass success, success after retries, actual skips and cases omitted from retries because they already passed. In this repository, inspect `ciIt()` and the resolved workflow at the tested revisions to interpret retry omissions. A green job does not prove every case ran. Queued/running, failed, cancelled, skipped and missing evidence remain explicit; superseded runs do not validate the new revision.

If evidence is inaccessible, mark the affected behavior **unknown** and explain how that changes the proposed scope. Do not infer a pass or require private Drive access to use this method.

## 2. Map changes to coverage before adding checks

Use a compact map for material changes and supported payment routes:

| Change / behavior / risk | Platform | Existing assertion or device evidence | Tested revision / build / environment | Reuse decision and remaining gap |
| --- | --- | --- | --- | --- |
| Concrete trigger and observable outcome | Android, iOS or both | Link to relevant source and result/review | Pin what was actually tested | Reuse, focused new check, or unresolved gap; explain why |

Reuse evidence when the behavior and relevant dependencies remain applicable to the candidate. For older device evidence, inspect intervening changes and state the scope of reuse. Changed dependencies, configuration, platform behavior or distribution builds can justify a focused recheck. A green main/master run is not a passed release-head gate.

Account for unit, integration/journey, native UI, Appium and recorded manual coverage. Missing Appium coverage alone does not require repeating a passing device journey. Conversely, unit coverage of a policy does not prove physical biometrics or production provider compatibility.

Keep outstanding failures and coverage limits visible even when they are excluded from the sanity checklist. A release-specific accepted exception retains its failed/skipped status and does not automatically carry into another release.

## 3. Keep a small recurring mainnet smoke

Use the distributed candidate on a real Android device and iPhone, with existing funded test wallets/channels. Check the enabled production payment rails using small amounts and an independent counterparty:

- Bitcoin send and receive: verify recipient output, amount, fee, confirmation and reconciled activity/balance after reopening.
- Lightning: BOLT11 send/receive and an external Lightning-address payment; verify recipient settlement and reconciled activity/balance.
- Other enabled payment rails, such as USDT: send/receive against production services, independently verify the recipient balance and quoted/charged fee, then check final activity/balance after reopening.

Adapt to the release's supported features; record why a route or platform is inapplicable. This smoke checks production binaries and services. It does not repeat address-type, coin-selection, Boost, privacy or recovery matrices already supported by applicable evidence.

Combine compatible assertions into the same payment: a release-specific subscription can also be the outgoing USDT smoke, or a changed request flow can be exercised during the Lightning payment. Record every linked case's pass conditions separately; one successful transfer does not automatically pass all linked checks. Verify each app's role independently when testing between platforms.

## 4. Add only justified release-specific checks

For each remaining material risk, specify the concrete trigger, platform, setup/environment, expected result and why existing evidence is insufficient. Prioritize changed funds/authentication, persistence/recovery, payment routing and platform integration behavior. Scope follows risk, not a fixed case count.

Choose the environment that exposes the gap:

| Gap | Suitable environment |
| --- | --- |
| Distributed binary, production routing/provider compatibility | Signed mainnet candidate and real devices |
| Physical biometrics, lifecycle or hardware integration | Relevant real device/accessory; network follows the scenario |
| Channel boundaries, timed failures, retry/recovery, destructive or repeatable fault setup | Regtest or controlled fixtures with matching app configuration |

Do not open a mainnet channel solely to test a limit that can be exercised on regtest. Do not revive retired features as recurring checks. Use the historical regression suite to select scenarios when a change warrants them, not as a mandatory pre-release checklist.

## 5. Deliver the plan and execution record

Return, in the requested format:

1. Release/build/test pins and evidence cutoff date.
2. Change-to-coverage map, including reused evidence and its limits.
3. Recurring mainnet checks and release-specific checks, with shared payment/setup dependencies identified.
4. Outstanding failures, skips, unknowns and any explicitly recorded release-specific exceptions.

Each executable case needs these fields; use a table or individual case blocks when long steps make a table hard to read:

| Field | Content |
| --- | --- |
| ID and scope | Stable ID; recurring or release-specific; platform |
| Build/environment | Exact artifact/version/revision, network and required device/setup |
| Steps and pass condition | Concrete actions and observable outcome |
| Reason | Remaining gap and supporting evidence/source |
| Status | Not run, In progress, Passed, Failed, Blocked or Skipped |
| Execution | Tester, date, device/OS and actual build |
| Evidence | Relevant run/review, transaction/proof or sanitized artifact reference |

New cases start **Not run**. **Passed** means all named assertions were observed on the recorded build. **Failed** means an observed mismatch; **Blocked** means a prerequisite prevents execution; **Skipped** means deliberately omitted with a reason. **In progress** is not a pass. A reused result belongs in the evidence map, not as a fabricated new execution.

When a spreadsheet/framework update is requested, keep `<version> sanity` for execution and `<version> evidence` for pins, reuse and exceptions. Preserve the regression reference and previous runs. Link this guide as the method instead of maintaining a second copy. A Markdown record is equally valid; no particular private spreadsheet or tool is required. Public examples/evidence must omit secrets, seed phrases, personal wallet identifiers, private coordination links and private infrastructure details.

Planning does not itself authorize payments, builds, workflow reruns, device execution or publication. Carry out only the execution/publication already authorized by the task. Passing sanity does not erase failed gates or establish release sign-off. If the candidate changes, assess the diff and refresh affected evidence and cases before a readiness decision.
