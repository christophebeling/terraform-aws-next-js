import * as fs from 'fs';
import * as path from 'path';
import { parse as parseJSON } from 'hjson';
import { Proxy } from '@dealmore/terraform-next-proxy/src/index';
import { ConfigOutput } from '@dealmore/terraform-next-build/src/types';

import { generateSAM, SAM as SAMInterface } from './lib/generateAppModel';

const pathToFixtures = path.join(__dirname, 'fixtures');

interface ProbeFile {
  probes: { path: string; mustContain?: string }[];
}

describe('Test proxy config', () => {
  for (const fixture of fs.readdirSync(pathToFixtures)) {
    describe(`Testing fixture: ${fixture}`, () => {
      const pathToFixture = path.join(pathToFixtures, fixture);
      let config: ConfigOutput;
      let probeFile: ProbeFile;
      let proxy: Proxy;
      let SAM: SAMInterface;

      beforeAll(async () => {
        // Get the config
        config = require(path.join(
          pathToFixture,
          '.next-tf/config.json'
        )) as ConfigOutput;

        // Get the probes
        probeFile = parseJSON(
          fs
            .readFileSync(path.join(pathToFixture, 'probes.json'))
            .toString('utf-8')
        ) as ProbeFile;

        // Init proxy
        const lambdaRoutes = Object.values(config.lambdas).map(
          (lambda) => lambda.route
        );
        proxy = new Proxy(config.routes, lambdaRoutes, config.staticRoutes);

        // Generate SAM
        SAM = await generateSAM({
          lambdas: config.lambdas,
          cwd: path.join(pathToFixture, '.next-tf'),
        });
        await SAM.start();
      });

      afterAll(async () => {
        // Shutdown SAM
        await SAM.stop();
      });

      test('Proxy', async () => {
        for (const probe of probeFile.probes) {
          const result = proxy.route(probe.path);

          if (SAM.mapping.has(result.dest)) {
            const response = await SAM.sendRequest({
              functionName: SAM.mapping.get(result.dest)!,
              path: result.dest,
              headers: result.headers,
            });

            if (probe.mustContain) {
              expect(response.body).toContain(probe.mustContain);
            }
          }
        }
      });
    });
  }
});
