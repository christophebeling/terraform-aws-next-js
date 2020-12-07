// Temporary test to check the functionality of AWS SAM

import { ConfigOutput } from '@dealmore/terraform-next-build/src/types';
import * as path from 'path';

import { generateSAM } from './lib/generateAppModel';

describe('Testing SAM', () => {
  test('SAM', async () => {
    const pathToFixture =
      '/Users/felix/code/dm/terraform-aws-nextjs/test/fixtures/00-shared-lambdas';
    // Get the config
    const config = require(path.join(
      pathToFixture,
      '.next-tf/config.json'
    )) as ConfigOutput;

    const SAM = await generateSAM({
      lambdas: config.lambdas,
      cwd: path.join(pathToFixture, '.next-tf'),
    });

    await SAM.start();
    const respose = await SAM.sendRequest({
      functionName: SAM.mapping.get('__NEXT_PAGE_LAMBDA_0')!,
      path: '/__NEXT_PAGE_LAMBDA_0',
      headers: {
        'x-nextjs-page': '/teams/invite/hello',
      },
    });
    console.log('RESPONSE: ', respose);

    await SAM.stop();
  });
});
