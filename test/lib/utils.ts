import { randomBytes } from 'crypto';
import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Generates a random function name for AWS SAM
 * (Because SAM only accepts alphanumeric names)
 */
export function randomServerlessFunctionName() {
  return randomBytes(20).toString('hex');
}

interface Payload {
  body?: string;
  httpMethod: 'POST' | 'GET';
  headers: { [key: string]: string };
  path: string
}

/**
 * Creates an AWS ApiGateway event
 * @see: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
 */
export function createPayload(payload: Payload) {
  return {
    resource: payload.path,
    path: payload.path,
    headers: payload.headers,
    httpMethod: payload.httpMethod,
    body: payload.body,

    isBase64Encoded: false,
  } as APIGatewayProxyEvent;
}
