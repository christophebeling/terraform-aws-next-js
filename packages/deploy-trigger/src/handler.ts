import { S3Handler } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import { deployTrigger } from './deploy-trigger';

const CacheControlImmutable = 'public,max-age=31536000,immutable';
const CacheControlStaticHtml = 'max-age=300';
const deploymentConfigurationKey = '__tf-next/deployment.json';

/**
 * Reads or creates a deployment.json file which holds information about
 * which files were included in the deployment
 *
 * It returns a string of keys of files that can be de
 */
function updateDeploymentConfiguration(s3: S3, bucket: string) {}

export const handler: S3Handler = async function (event) {
  const s3 = new S3({ apiVersion: '2006-03-01' });

  // Get needed information of the event
  const { object } = event.Records[0].s3;
  const { versionId, key } = object;
  const sourceBucket = event.Records[0].s3.bucket.name;

  await deployTrigger({
    s3,
    sourceBucket,
    deployBucket: process.env.TARGET_BUCKET,
    key,
    versionId,
  });
};
