// Opt-in collector validation, deliberately outside the default spec glob.
describe('diagnostics_probe_setup', () => {
  beforeEach(() => {
    throw new Error('INTENTIONAL_DIAGNOSTICS_SETUP_FAILURE');
  });
  it('retains a failed beforeEach', () => {
    throw new Error('BODY_MUST_NOT_RUN');
  });
});

describe('diagnostics_probe_body', () => {
  it('retains a failed body', () => {
    throw new Error('INTENTIONAL_DIAGNOSTICS_BODY_FAILURE');
  });
});
