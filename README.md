## 📱 Bitkit E2E Tests

End-to-end tests for the [Bitkit-android](https://github.com/synonymdev/bitkit-android) and [Bitkit-ios](https://github.com/synonymdev/bitkit-ios) mobile app using [WebdriverIO](https://webdriver.io/) and [Appium](https://appium.io/). Supports both **Android** and **iOS** platforms.

---

### 📦 Requirements

| Platform             | Tools                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Android**          | - **Android SDK** (API 33 – 35)<br>- **Emulator or real device**                                                                                          |
| **iOS (macOS only)** | - **Xcode** (with Command Line Tools)<br>- **FFmpeg** – used for video recordings and screenshots<br>  → Install via Homebrew:<br>  `brew install ffmpeg` |

**General requirements**

- **Node.js** (≥ 22)
- **Appium server** (installed locally or started via WebdriverIO)

---

### 🛠️ Setup

```bash
# Clone the repo
git clone https://github.com/synonymdev/bitkit-e2e-tests.git
cd bitkit-e2e-tests

# Install dependencies
npm install
```

---

### 📂 Directory structure

```
artifacts/              # screenshots and (optionally) videos of failed tests
aut/                    # Place your .apk / .ipa files here
docker/                 # docker compose regtest based backend for Bitkit wallet
test/
  ├── specs/            # Test suites (e.g., onboarding.e2e.ts)
  ├── helpers/          # Test helpers: selectors, setup, actions
```

> ℹ️ Screenshots and (optionally) videos of **failed tests** will be saved to `artifacts/`. To enable video recording, set the `RECORD_VIDEO=true` environment variable.

---

### 🧱 Build apps locally (Android/iOS)

If you have `bitkit-e2e-tests`, `bitkit-android`, and `bitkit-ios` checked out in the same parent directory, you can use the helper scripts to build local artifacts (local Electrum by default). The outputs land in `./aut` and are ready to be tested.

```bash
# Android (builds ../bitkit-android and copies APK to ./aut/bitkit_e2e.apk)
./scripts/build-android-apk.sh

# Legacy RN Android (builds ../bitkit and copies APK to ./aut/bitkit_rn_regtest.apk)
./scripts/build-rn-android-apk.sh

# Legacy RN iOS simulator (builds ../bitkit and copies app to ./aut/bitkit_rn_regtest_ios.app)
./scripts/build-rn-ios-sim.sh

# iOS (builds ../bitkit-ios and copies IPA to ./aut/bitkit_e2e.ipa)
./scripts/build-ios-sim.sh
```

Optional backend selection (`BACKEND=local` is default and can be omitted):

```bash
# Android
BACKEND=local ./scripts/build-android-apk.sh
BACKEND=regtest ./scripts/build-android-apk.sh

# Legacy RN Android
BACKEND=regtest ./scripts/build-rn-android-apk.sh

# Legacy RN iOS simulator
BACKEND=regtest ./scripts/build-rn-ios-sim.sh

# iOS
BACKEND=local ./scripts/build-ios-sim.sh
BACKEND=regtest ./scripts/build-ios-sim.sh
```

---

### 🧪 Running tests

**Important:** The `BACKEND` environment variable controls which infrastructure the tests use for blockchain operations (deposits, mining blocks):

| Backend                   | Infrastructure                                                                   | When to use                       |
| ------------------------- | -------------------------------------------------------------------------------- | --------------------------------- |
| `BACKEND=local` (default) | Local docker stack (Bitcoin RPC on localhost:18443, Electrum on localhost:60001) | Apps built with `BACKEND=local`   |
| `BACKEND=regtest`         | Blocktank API over the internet (remote regtest)                                 | Apps built with `BACKEND=regtest` |

> ⚠️ **The `BACKEND` must match how the app was built.** If the app connects to remote electrum, use `BACKEND=regtest`. If it connects to localhost, use `BACKEND=local`.

```bash
# Run all tests on Android (local backend - default)
npm run e2e:android

# Run all tests on Android (regtest backend)
BACKEND=regtest npm run e2e:android

# Run all tests on iOS
npm run e2e:ios
BACKEND=regtest npm run e2e:ios
```

To run a **specific test file**:

```bash
npm run e2e:android -- --spec ./test/specs/onboarding.e2e.ts

# With regtest backend
BACKEND=regtest npm run e2e:android -- --spec ./test/specs/migration.e2e.ts
```

To run a **specific test case**:

```bash
npm run e2e:android -- --mochaOpts.grep "Can pass onboarding correctly"
```

---

### 🏷️ Tags

Test suites (and some individual tests) are tagged using a simple `@tag` convention in the `describe` / `ciIt` titles:

```typescript
describe('@backup - Backup', () => {
  ciIt('@backup_1 - Can backup metadata, widget, settings and restore them', async () => {
    // ...
  });
});
```

> 💡 Note: Use `ciIt` instead of `it` in specs. Locally it behaves the same, but on CI it records passing tests in `/tmp/lock` so retries skip already-green tests and only re-run failures.

You can use Mocha’s `--grep` option to run only the tests that match a given tag (regex supported). For example:

```bash
# Run only backup tests
npm run e2e:android -- --mochaOpts.grep "@backup"

# Run backup OR onboarding OR onchain tests
npm run e2e:android -- --mochaOpts.grep "@onchain|@backup|@onboarding"

# Run everything except backup tests
npm run e2e:android -- --mochaOpts.grep "@backup" --mochaOpts.invert
```

---

### 🤖 CI Helper Scripts

These helper scripts wrap the regular `npm run e2e:*` commands and add CI-friendly extras such as log capture and artifact collection. You can also run them locally when debugging.

#### Android (`ci_run_android.sh`)

The Android script will:

- Clear and capture `adb logcat` output into `./artifacts/logcat.txt`.
- Reverse the regtest port (`60001`) for local backend.
- Run the Android E2E tests.
- Forward any arguments directly to Mocha/WebdriverIO.

**Usage examples:**

```bash
# Run all Android tests with local backend (default)
./ci_run_android.sh

# Run all Android tests with regtest backend (for apps built with BACKEND=regtest)
BACKEND=regtest ./ci_run_android.sh

# Run only @backup tests
./ci_run_android.sh --mochaOpts.grep "@backup"

# Run migration tests (typically need regtest backend for RN app)
BACKEND=regtest ./ci_run_android.sh --mochaOpts.grep "@migration"

# Run backup OR onboarding OR onchain tests
./ci_run_android.sh --mochaOpts.grep "@backup|@onboarding|@onchain"

# Run everything except @backup
./ci_run_android.sh --mochaOpts.grep "@backup" --mochaOpts.invert

# Run a specific spec file
./ci_run_android.sh --spec ./test/specs/onboarding.e2e.ts
```

#### iOS (`ci_run_ios.sh`)

The iOS helper mirrors the Android workflow but tailors it for the Apple Simulator:

- Ensures a simulator is booted (boots an `iPhone 17*` fallback if none is running).
- Captures Bitkit-specific `log stream` output to `./artifacts/simulator.log`, restarting automatically if the simulator restarts or the keychain is reset.
- Cleans up the background log task when the script exits.
- Passes any extra flags straight through to WebdriverIO/Mocha.

**Usage examples:**

```bash
# Run all iOS tests with local backend (default)
./ci_run_ios.sh

# Run all iOS tests with regtest backend
BACKEND=regtest ./ci_run_ios.sh

# Run only @onboarding-tagged tests
./ci_run_ios.sh --mochaOpts.grep "@onboarding"

# Run a specific spec file
./ci_run_ios.sh --spec ./test/specs/onboarding.e2e.ts
```

---

### 💡 Tips

- Use `elementById()` and `tap()` helpers to write cross-platform tests.
- Use `confirmInputOnKeyboard()` to handle keyboard actions across Android/iOS.
- Tests are designed to work identically on both platforms where possible.
- To debug, add `console.info()` or enable `wdio` debug logs.
- Use `ciIt()` instead of `it()` on CI to skip already-passing tests in retries.
- In app-repo CI, E2E typically runs in three attempts with `continue-on-error: true`. If attempt 3 fails, it implies the same tests failed in attempts 1 and 2 (only failures are re-run), so check step logs/artifacts even if the job is green.
