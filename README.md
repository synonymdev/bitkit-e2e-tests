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

### 💡 Tips

- Use `elementById()` and `tap()` helpers to write cross-platform tests.
- Use `confirmInputOnKeyboard()` to handle keyboard actions across Android/iOS.
- Tests are designed to work identically on both platforms where possible.
- To debug, add `console.info()` or enable `wdio` debug logs.
