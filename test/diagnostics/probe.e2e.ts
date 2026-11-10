// Opt-in collector validation, deliberately outside the default spec glob.
describe('diagnostics_probe_setup', () => {
  beforeEach(async () => {
    await driver.activateApp(process.env.APP_ID_IOS ?? 'to.bitkit');
    await $('~Continue').waitForDisplayed();
    throw new Error('INTENTIONAL_DIAGNOSTICS_SETUP_FAILURE');
  });
  it('retains a failed beforeEach', () => {
    throw new Error('BODY_MUST_NOT_RUN');
  });
});

describe('diagnostics_probe_body', () => {
  beforeEach(async () => {
    await driver.activateApp(process.env.APP_ID_IOS ?? 'to.bitkit');
    await $('~Continue').waitForDisplayed();
  });
  it('retains a failed body', () => {
    throw new Error('INTENTIONAL_DIAGNOSTICS_BODY_FAILURE');
  });
});
