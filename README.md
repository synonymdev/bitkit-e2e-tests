## 📱 Bitkit E2E Tests

End-to-end tests for the [Bitkit-android](https://github.com/synonymdev/bitkit-android) and [Bitkit-ios](https://github.com/synonymdev/bitkit-ios) mobile app using [WebdriverIO](https://webdriver.io/) and [Appium](https://appium.io/). Supports both **Android** and **iOS** platforms.

:warning: Work In Progress! :warning:

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

### 🧪 Running tests

```bash
# Run all tests on Android
npm run e2e:android

# Run all tests on iOS
npm run e2e:ios
```

To run a **specific test file**:

```bash
npm run e2e:android -- --spec ./test/specs/onboarding.e2e.ts
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

> 💡 Note: Use `ciIt` instead of `it` in specs. Locally it behaves the same, but on CI it automatically skips tests that already passed in previous attempts, making retries faster.

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
- Reverse the regtest port (`60001`).
- Run the Android E2E tests.
- Forward any arguments directly to Mocha/WebdriverIO.

**Usage examples:**

```bash
# Run all Android tests (with logcat capture)
./ci_run_android.sh

# Run only @backup tests
./ci_run_android.sh --mochaOpts.grep "@backup"

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
# Run all iOS tests (with simulator log capture)
./ci_run_ios.sh

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
- Use `ciIt()` instead of `it()` on CI to automatically skip tests that already passed in a previous run.
