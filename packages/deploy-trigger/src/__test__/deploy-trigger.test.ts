import * as crypto from 'crypto';
import * as fs from 'fs';
import { S3 } from 'aws-sdk';
import archiver from 'archiver';
import * as tmp from 'tmp';
import { deployTrigger } from '../deploy-trigger';

interface BucketHandler {
  bucketName: string;
  destroy: () => Promise<boolean>;
}

/**
 * Helper to create a new bucket
 */
async function createBucket(
  s3: S3,
  bucketName: string = crypto.randomBytes(8).toString('hex')
): Promise<BucketHandler> {
  await s3
    .createBucket({
      Bucket: bucketName,
    })
    .promise();

  return {
    bucketName,
    async destroy() {
      // Empty bucket and destroy it
      try {
        // We can't delete a bucket before emptying its contents
        const { Contents } = await s3
          .listObjects({ Bucket: bucketName })
          .promise();
        if (Contents && Contents.length > 0) {
          // TypeGuard
          function isObjectIdentifier(
            obj: S3.Object
          ): obj is S3.ObjectIdentifier {
            return typeof obj.Key === 'string';
          }

          await s3
            .deleteObjects({
              Bucket: bucketName,
              Delete: {
                Objects: Contents.filter(isObjectIdentifier).map(({ Key }) => ({
                  Key,
                })),
              },
            })
            .promise();
        }
        await s3.deleteBucket({ Bucket: bucketName }).promise();
        return true;
      } catch (err) {
        console.log(err);
        return false;
      }
    },
  };
}

describe('deploy-trigger', () => {
  let s3: S3;

  beforeAll(() => {
    // Initialize the local S3 client
    s3 = new S3({
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId: process.env.MINIO_ACCESS_KEY,
      secretAccessKey: process.env.MINIO_SECRET_KEY,

      s3ForcePathStyle: true,
      signatureVersion: 'v4',
      sslEnabled: false,
    });
  });

  describe('Extract an uploaded deployment', () => {
    let sourceBucket: BucketHandler;
    let targetBucket: BucketHandler;

    beforeAll(async () => {
      // Initialize buckets
      sourceBucket = await createBucket(s3);
      targetBucket = await createBucket(s3);
    });

    afterAll(async () => {
      // Cleanup buckets
      await sourceBucket.destroy();
      await targetBucket.destroy();
    });

    test('Extract an uploaded deployment', async () => {
      const packageKey = 'static-website-files.zip';
      const packageContent = ['index.html', '404.html', '_next/static/some.js'];

      // Create an dummy deployment package
      const tmpFile = tmp.fileSync();
      const output = fs.createWriteStream(tmpFile.name);
      const archive = archiver('zip', {
        zlib: { level: 5 },
      });
      archive.pipe(output);
      packageContent.forEach((name) => {
        archive.append('', { name });
      });
      archive.finalize();

      await s3
        .upload({
          Key: 'static-website-files.zip',
          Body: fs.createReadStream(tmpFile.name),
          Bucket: sourceBucket.bucketName,
        })
        .promise();

      // Run deployTrigger
      await deployTrigger({
        s3,
        sourceBucket: sourceBucket.bucketName,
        deployBucket: targetBucket.bucketName,
        key: packageKey,
      });

      // Check targetBucket
      const { Contents } = await s3
        .listObjects({ Bucket: targetBucket.bucketName })
        .promise();

      // Check if the whole content from the deployment package is uploaded
      // to the target bucket
      expect(Contents).toBeDefined();
      packageContent.forEach((fileKey) => {
        expect(Contents).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              Key: fileKey,
            }),
          ])
        );
      });
    });
  });
});
