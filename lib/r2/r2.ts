import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  // We throw only if they are not set, but we log a warning for building phase.
  console.warn('Cloudflare R2 is not fully configured in environment variables.');
}

// Initialize AWS S3 Client for Cloudflare R2 compatibility
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: accessKeyId || '',
    secretAccessKey: secretAccessKey || '',
  },
});

/**
 * Uploads a generated PDF buffer to Cloudflare R2.
 * Key format: "reports/{userId}/{reportId}.pdf"
 */
export async function uploadPDF(
  userId: string,
  reportId: string,
  pdfBuffer: Buffer
): Promise<string> {
  const key = `reports/${userId}/${reportId}.pdf`;

  if (!accountId || accountId === 'your-cloudflare-account-id') {
    const localPath = path.join(process.cwd(), 'public', 'temp-reports', key);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, pdfBuffer);
    return key;
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: pdfBuffer,
    ContentType: 'application/pdf',
  });

  await s3Client.send(command);
  return key;
}

/**
 * Generates a temporary signed URL for downloading a private PDF from R2.
 */
export async function generateSignedURL(
  pdfKey: string,
  expirySeconds: number
): Promise<string> {
  if (!accountId || accountId === 'your-cloudflare-account-id') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    return `${appUrl}/temp-reports/${pdfKey}`;
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: pdfKey,
  });

  // Generate signed URL with the specified expiry
  const signedUrl = await getSignedUrl(s3Client, command, {
    expiresIn: expirySeconds,
  });

  return signedUrl;
}

/**
 * Deletes a PDF file from R2.
 */
export async function deletePDF(pdfKey: string): Promise<void> {
  if (!accountId || accountId === 'your-cloudflare-account-id') {
    const localPath = path.join(process.cwd(), 'public', 'temp-reports', pdfKey);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
    return;
  }

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: pdfKey,
  });

  await s3Client.send(command);
}

/**
 * Downloads a PDF file from R2 as a Buffer (for email attachment).
 */
export async function downloadPDF(pdfKey: string): Promise<Buffer> {
  if (!accountId || accountId === 'your-cloudflare-account-id') {
    const localPath = path.join(process.cwd(), 'public', 'temp-reports', pdfKey);
    return fs.readFileSync(localPath);
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: pdfKey,
  });

  const response = await s3Client.send(command);
  if (!response.Body) {
    throw new Error(`Failed to retrieve file body from R2 for key: ${pdfKey}`);
  }

  // Convert S3 Readable stream to Buffer
  const streamToBuffer = async (stream: any): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
      const chunks: any[] = [];
      stream.on('data', (chunk: any) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  };

  return await streamToBuffer(response.Body);
}
