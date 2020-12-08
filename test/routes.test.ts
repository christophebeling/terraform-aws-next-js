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
          const proxyResult = proxy.route(probe.path);
          if (SAM.mapping.has(proxyResult.dest)) {
            const response = await SAM.sendRequest({
              functionName: SAM.mapping.get(proxyResult.dest)!,
              path: proxyResult.dest,
              searchParams: proxyResult.uri_args,
              headers: proxyResult.headers,
            });

            if (probe.mustContain) {
              expect(response.body).toContain(probe.mustContain);
            }
          } else {
            fail(
              `Could not resolve ${probe.path} to an existing lambda! (Resolved to: ${proxyResult.dest})`
            );
          }
        }
      });
    });
  }
});
