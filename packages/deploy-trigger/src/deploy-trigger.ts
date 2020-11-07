import { S3 } from 'aws-sdk';
import unzipper from 'unzipper';
import { getType } from 'mime';

const CacheControlImmutable = 'public,max-age=31536000,immutable';
const CacheControlStaticHtml = 'max-age=300';

interface Props {
  s3: S3;
  sourceBucket: string;
  deployBucket: string;
  key: string;
  versionId?: string;
}

export async function deployTrigger({
  s3,
  key,
  sourceBucket,
  deployBucket,
  versionId,
}: Props) {
  const params: S3.Types.DeleteObjectRequest = {
    Key: key,
    Bucket: sourceBucket,
    VersionId: versionId,
  };

  // Get the object that triggered the event
  const zip = s3
    .getObject(params)
    .createReadStream()
    .pipe(unzipper.Parse({ forceStream: true }));

  const uploads: Promise<S3.ManagedUpload.SendData>[] = [];
  const files: string[] = [];

  for await (const e of zip) {
    const entry = e as unzipper.Entry;

    const fileName = entry.path;
    const type = entry.type;
    if (type === 'File') {
      // Get ContentType
      const ContentType = getType(fileName) || 'text/html';

      const uploadParams: S3.Types.PutObjectRequest = {
        Bucket: deployBucket,
        Key: fileName,
        Body: entry,
        ContentType,
        CacheControl:
          ContentType === 'text/html'
            ? CacheControlStaticHtml
            : CacheControlImmutable,
      };

      files.push(fileName);
      uploads.push(s3.upload(uploadParams).promise());
    } else {
      entry.autodrain();
    }
  }

  await Promise.all(uploads);

  // Cleanup
  await s3.deleteObject(params).promise();
}
