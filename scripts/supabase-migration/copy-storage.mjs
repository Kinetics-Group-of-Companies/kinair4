import { createClient } from "@supabase/supabase-js";

const required = [
  "SOURCE_SUPABASE_URL",
  "SOURCE_SUPABASE_SERVICE_ROLE_KEY",
  "TARGET_SUPABASE_URL",
  "TARGET_SUPABASE_SERVICE_ROLE_KEY",
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
}

const source = createClient(
  process.env.SOURCE_SUPABASE_URL,
  process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const target = createClient(
  process.env.TARGET_SUPABASE_URL,
  process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const EXPECTED_BUCKETS = [
  "air-curtain-assets",
  "brand-assets",
  "lpo-documents",
  "project-datasheets",
  "software-releases",
  "submittal-control",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(label, fn, attempts = 4) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (i === attempts) break;
      console.warn(`${label} failed (attempt ${i}/${attempts}); retrying...`);
      await sleep(750 * i);
    }
  }
  throw last;
}

async function listAllFiles(bucket, path = "") {
  const output = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await source.storage.from(bucket).list(path, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`List ${bucket}/${path}: ${error.message}`);
    const rows = data ?? [];
    for (const item of rows) {
      if (!item.metadata) {
        output.push(...await listAllFiles(bucket, `${path}${item.name}/`));
      } else {
        output.push({ fullPath: `${path}${item.name}`, metadata: item.metadata });
      }
    }
    if (rows.length < limit) break;
    offset += limit;
  }
  return output;
}

async function ensureBucket(bucket) {
  const options = {
    public: Boolean(bucket.public),
    fileSizeLimit: bucket.file_size_limit ?? undefined,
    allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
  };
  const { data: existing, error: getError } = await target.storage.getBucket(bucket.name);
  if (getError && !/not.?found/i.test(getError.message)) throw getError;
  if (!existing) {
    const { error } = await target.storage.createBucket(bucket.name, options);
    if (error) throw new Error(`Create bucket ${bucket.name}: ${error.message}`);
  } else {
    const { error } = await target.storage.updateBucket(bucket.name, options);
    if (error) throw new Error(`Update bucket ${bucket.name}: ${error.message}`);
  }
}

async function copyFile(bucket, file) {
  return retry(`${bucket}/${file.fullPath}`, async () => {
    const { data, error: downloadError } = await source.storage.from(bucket).download(file.fullPath);
    if (downloadError) throw new Error(`Download: ${downloadError.message}`);
    const { error: uploadError } = await target.storage.from(bucket).upload(file.fullPath, data, {
      upsert: true,
      contentType: file.metadata?.mimetype || data.type || undefined,
      cacheControl: file.metadata?.cacheControl || undefined,
    });
    if (uploadError) throw new Error(`Upload: ${uploadError.message}`);
  });
}

const { data: sourceBuckets, error: bucketsError } = await source.storage.listBuckets();
if (bucketsError) throw bucketsError;

const bucketMap = new Map((sourceBuckets ?? []).map((bucket) => [bucket.name, bucket]));
for (const name of EXPECTED_BUCKETS) {
  if (!bucketMap.has(name)) {
    console.warn(`Expected bucket '${name}' does not exist in source; continuing.`);
  }
}

let totalFiles = 0;
for (const bucket of sourceBuckets ?? []) {
  await ensureBucket(bucket);
  const files = await listAllFiles(bucket.name);
  console.log(`\n${bucket.name}: ${files.length} object(s)`);
  let copied = 0;
  for (const file of files) {
    await copyFile(bucket.name, file);
    copied++;
    totalFiles++;
    if (copied % 20 === 0 || copied === files.length) {
      console.log(`  copied ${copied}/${files.length}`);
    }
  }
}

console.log(`\nStorage migration complete: ${totalFiles} object(s) copied with original paths.`);
