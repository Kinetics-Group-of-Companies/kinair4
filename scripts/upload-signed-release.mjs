import fs from 'node:fs';
import tus from 'tus-js-client';

const [filePath, objectName] = process.argv.slice(2);
const token = process.env.SUPABASE_SIGNED_UPLOAD_TOKEN;

if (!filePath || !objectName || !token) {
  throw new Error('file path, object name, and SUPABASE_SIGNED_UPLOAD_TOKEN are required');
}

const size = fs.statSync(filePath).size;
const file = fs.createReadStream(filePath);

await new Promise((resolve, reject) => {
  const upload = new tus.Upload(file, {
    endpoint: 'https://bfofrgqdvqehdsiccyhk.storage.supabase.co/storage/v1/upload/resumable',
    headers: {
      'x-signature': token,
      'x-upsert': 'true',
    },
    uploadSize: size,
    chunkSize: 6 * 1024 * 1024,
    retryDelays: [0, 3000, 5000, 10000, 20000],
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    metadata: {
      bucketName: 'software-releases',
      objectName,
      contentType: 'application/zip',
      cacheControl: '3600',
    },
    onError: reject,
    onProgress: (uploaded, total) => {
      console.log(`${uploaded}/${total} (${((uploaded / total) * 100).toFixed(1)}%)`);
    },
    onSuccess: resolve,
  });
  upload.start();
});

console.log(`Uploaded ${objectName}`);
