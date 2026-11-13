// Opt-in collector validation, deliberately outside the default spec glob.
describe('diagnostics_probe_timeout', () => {
  before(async () => {
    await driver.activateApp(process.env.APP_ID_IOS ?? 'to.bitkit');
    await $('~Continue').waitForDisplayed();
  });
  describe('diagnostics_probe_timeout_case', function () {
    this.timeout(1_000);
    beforeEach(async () => {
      await new Promise<void>(() => {}); // A real framework deadline, not a thrown error.
    });
    it('retains a timed out beforeEach', () => {
      throw new Error('BODY_MUST_NOT_RUN');
    });
  });
});

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
