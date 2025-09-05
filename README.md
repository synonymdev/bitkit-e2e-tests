## 📱 Bitkit E2E Tests

End-to-end tests for the [Bitkit-android](https://github.com/synonymdev/bitkit-android) and [Bitkit-ios](https://github.com/synonymdev/bitkit-ios) mobile app using [WebdriverIO](https://webdriver.io/) and [Appium](https://appium.io/). Supports both **Android** and **iOS** platforms.

:warning: Work In Progress! :warning:

---

### 📦 Requirements

- **Node.js** (≥ 22)
- **Android SDK** (with at least API 33–35)
- **Xcode** (for iOS, macOS only)
- Appium server installed locally or started via WebdriverIO
- Emulator or real device running

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

Test suites (and some individual tests) are tagged using a simple `@tag` convention in the `describe` / `it` titles:

```typescript
describe('@backup - Backup', () => {
  it('@backup_1 - Can backup metadata, widget, settings and restore them', async () => {
    // ...
  });
});
```

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

### 💡 Tips

- Use `elementById()` and `tap()` helpers to write cross-platform tests.
- Use `confirmInputOnKeyboard()` to handle keyboard actions across Android/iOS.
- Tests are designed to work identically on both platforms where possible.
- To debug, add `console.info()` or enable `wdio` debug logs.
