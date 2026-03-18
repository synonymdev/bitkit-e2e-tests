/**
 * WDIO config that attaches to the already-installed app on the simulator.
 * Does NOT reinstall, reset, or modify the app. Just connects via Appium.
 *
 * Usage:
 *   BACKEND=regtest npx wdio wdio.no-install.conf.ts --spec ./test/specs/receive-ln-payments.e2e.ts
 */

import { config as baseConfig } from './wdio.conf';

const isAndroid = process.env.PLATFORM === 'android';

const iosDeviceName = process.env.SIMULATOR_NAME || 'iPhone 17';
const iosPlatformVersion = process.env.SIMULATOR_OS_VERSION || '26.0.1';
const appBundleId = process.env.APP_ID_IOS ?? 'to.bitkit';
const androidAppId = process.env.APP_ID_ANDROID ?? 'to.bitkit.dev';

export const config: WebdriverIO.Config = {
  ...baseConfig,
  specs: [['./test/specs/receive-ln-payments.e2e.ts']],
  capabilities: [
    isAndroid
      ? {
          platformName: 'Android',
          'appium:automationName': 'UiAutomator2',
          'appium:appPackage': androidAppId,
          'appium:appActivity': '.ui.MainActivity',
          'appium:noReset': true,
          'appium:fullReset': false,
          'appium:autoGrantPermissions': true,
          'appium:newCommandTimeout': 300,
        }
      : {
          platformName: 'iOS',
          'appium:automationName': 'XCUITest',
          'appium:udid': process.env.SIMULATOR_UDID || 'auto',
          'appium:deviceName': iosDeviceName,
          ...(iosPlatformVersion ? { 'appium:platformVersion': iosPlatformVersion } : {}),
          'appium:bundleId': appBundleId,
          'appium:noReset': true,
          'appium:fullReset': false,
          'appium:autoAcceptAlerts': false,
          'appium:newCommandTimeout': 300,
          'appium:wdaLaunchTimeout': 300000,
          'appium:wdaConnectionTimeout': 300000,
        },
  ],
};
