import { ciIt } from '../helpers/suite';

describe('@cjit_mainnet - CJIT smoke', () => {
  ciIt.skip(
    '@cjit_1 - Can create and settle CJIT invoice',
    async () => {
      throw new Error('Enable after mainnet CJIT flow is validated.');
    }
  );
});
