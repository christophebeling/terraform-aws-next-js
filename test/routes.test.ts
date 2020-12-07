import * as fs from 'fs';
import * as path from 'path';
import { parse as parseJSON } from 'hjson';
import { Proxy } from '@dealmore/terraform-next-proxy/src/index';
import { ConfigOutput } from '@dealmore/terraform-next-build/src/types';

import { generateSAM } from './lib/generateAppModel';

const pathToFixtures = path.join(__dirname, 'fixtures');

interface ProbeFile {
  probes: { path: string }[];
}

describe('Test proxy config', () => {
  for (const fixture of fs.readdirSync(pathToFixtures)) {
    test(`Proxy config: ${fixture}`, async () => {
      const pathToFixture = path.join(pathToFixtures, fixture);

      // Get the config
      const config = require(path.join(
        pathToFixture,
        '.next-tf/config.json'
      )) as ConfigOutput;

      // Get the probes
      const probeFile = parseJSON(
        fs
          .readFileSync(path.join(pathToFixture, 'probes.json'))
          .toString('utf-8')
      ) as ProbeFile;

      const lambdaRoutes = Object.values(config.lambdas).map(
        (lambda) => lambda.route
      );
      const proxy = new Proxy(config.routes, lambdaRoutes, config.staticRoutes);

      // Generate SAM
      const SAM = await generateSAM({
        lambdas: config.lambdas,
        cwd: path.join(pathToFixture, '.next-tf'),
      });

      await SAM.start();

      for (const probe of probeFile.probes) {
        const result = proxy.route(probe.path);
        console.log(result);
      }

      await SAM.stop();
    });
  }
});
