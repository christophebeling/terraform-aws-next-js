import { URLSearchParams } from 'url';
import { randomBytes } from 'crypto';
import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Generates a random function name for AWS SAM
 * (Because SAM only accepts alphanumeric names)
 */
export function randomServerlessFunctionName() {
  return randomBytes(20).toString('hex');
}

function generateQueryStringParameters(searchParams: URLSearchParams) {
  return Object.fromEntries(searchParams);
}

interface Payload {
  body?: string;
  httpMethod: 'POST' | 'GET';
  headers: { [key: string]: string };
  path: string;
  searchParams?: URLSearchParams;
}

/**
 * Creates an AWS ApiGateway event
 * @see: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
 */
export function createPayload(payload: Payload) {
  const queryStringParameters = payload.searchParams
    ? generateQueryStringParameters(payload.searchParams)
    : {};

  return {
    resource: payload.path,
    path: payload.path,
    headers: payload.headers,
    httpMethod: payload.httpMethod,
    body: payload.body,
    queryStringParameters,
    pathParameters: queryStringParameters,
    isBase64Encoded: false,
  } as APIGatewayProxyEvent;
}
