import * as fs from 'fs';
import * as path from 'path';
import { dirSync as tmpDir } from 'tmp';
import { Extract } from 'unzipper';
import { stringify as yaml } from 'yaml';
import getPort from 'get-port';
import { Lambda as AWSLambda } from 'aws-sdk';

import { createPayload, randomServerlessFunctionName } from './utils';
import { createSAMLocal, SAMLocal } from './SAMLocal';
import { APIGatewayProxyResult } from 'aws-lambda';

/**
 * Wrapper that generates a serverless application model (SAM) for lambda inputs
 * https://github.com/aws/serverless-application-model/blob/master/versions/2016-10-31.md#awsserverlessfunction
 */

interface ServerLessFunctionAPIEvent {
  Type: 'Api';
  Properties: {
    Path: string;
    Method: string;
  };
}

interface ServerLessFunction {
  Type: 'AWS::Serverless::Function';
  Properties: {
    Handler: string;
    Runtime: 'nodejs12.x';
    MemorySize: number;
    Timeout: number;
    Description?: string;
    Events: Record<'Api', ServerLessFunctionAPIEvent>;
  };
}

interface SAMTemplate {
  AWSTemplateFormatVersion: string;
  Transform: string[];
  Resources: Record<string, ServerLessFunction>;
}

interface ConfigLambda {
  handler: string;
  runtime: string;
  filename: string;
  route: string;
}

interface SendRequestPayload {
  functionName: string;
  path: string;
  headers?: Record<string, string>;
}

interface SendRequestResponse {
  headers: { [key: string]: string };
  body: string;
  statusCode: number;
}

function unzipToLocation(zipPath: string, location: string) {
  return new Promise((resolve, reject) => {
    // Ensure the dir exists
    fs.mkdirSync(location, { recursive: true });

    // Extract the files to the location
    fs.createReadStream(zipPath)
      .pipe(Extract({ path: location }))
      .on('close', () => resolve())
      .on('error', (err) => reject(err));
  });
}

interface Props {
  lambdas: Record<string, ConfigLambda>;
  cwd: string;
}

export async function generateSAM({ lambdas, cwd }: Props) {
  const _tmpDir = tmpDir();
  // const workdir = _tmpDir.name;
  const workdir = '/Users/felix/code/tmp/xyz';
  const mapping = new Map<string, string>();

  // Generate the SAM yml
  const SAMTemplate: SAMTemplate = {
    AWSTemplateFormatVersion: '2010-09-09',
    Transform: ['AWS::Serverless-2016-10-31'],
    Resources: {},
  };

  // Unpack all lambdas
  for (const [key, lambda] of Object.entries(lambdas)) {
    const functionName = randomServerlessFunctionName();
    mapping.set(key, functionName);
    await unzipToLocation(
      path.join(cwd, lambda.filename),
      path.join(workdir, functionName)
    );
    SAMTemplate.Resources[functionName] = {
      Type: 'AWS::Serverless::Function',
      Properties: {
        Handler: `${functionName}/${lambda.handler}`,
        Description: key,
        Runtime: 'nodejs12.x',
        MemorySize: 512,
        Timeout: 30,
        Events: {
          Api: {
            Type: 'Api', // TODO: Change to `HttpApi`
            // https://github.com/aws/serverless-application-model/blob/master/versions/2016-10-31.md#httpapi
            Properties: {
              Path: lambda.route,
              Method: 'get',
            },
          },
        },
      },
    };
  }

  // Write the SAM template
  fs.writeFileSync(path.join(workdir, 'template.yml'), yaml(SAMTemplate));

  let SAM: SAMLocal;
  let port: number;
  let client: AWSLambda;

  async function start() {
    // Get free port
    port = await getPort();
    SAM = await createSAMLocal('sdk', workdir, port);
    client = new AWSLambda({
      endpoint: `http://localhost:${port}`,
      region: 'local',
    });
  }

  async function stop() {
    await SAM.kill();
    _tmpDir.removeCallback();
  }

  async function sendRequest(
    payload: SendRequestPayload
  ): Promise<SendRequestResponse> {
    const eventPayload = createPayload({
      headers: payload.headers || {},
      httpMethod: 'GET',
      path: payload.path,
    });

    return client
      .invoke({
        FunctionName: payload.functionName,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(eventPayload),
      })
      .promise()
      .then((response) => {
        // Try to unpack the response

        const _payload = JSON.parse(
          response.Payload!.toString()
        ) as APIGatewayProxyResult;

        if (_payload.isBase64Encoded) {
          // Decode an base64 response first
          return {
            body: Buffer.from(_payload.body, 'base64').toString('utf-8'),
            headers: {},
            statusCode: _payload.statusCode,
          };
        }

        return {
          body: _payload.body,
          headers: {},
          statusCode: _payload.statusCode,
        };
      });
  }

  return {
    start,
    stop,
    sendRequest,
    mapping,
  };
}
