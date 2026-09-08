import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Full git checkouts already contain these files. Compact deployment uploads can
// omit them: restore the exact, reviewed bytes from an immutable public commit.
// Nothing is downloaded at runtime, and an unexpected local edit is never replaced.
const sourceCommit = '946faf2db521a241643cebab54afe669562cd86c';
const assets = [
  { name: 'trios-seasons-v1.mp4', bytes: 1832360, sha256: '9579ef489494d6a72168638e94697b50c0a1ed997101562b69ee81069b3cf8e8' },
  { name: 'trios-seasons-mobile-v1.mp4', bytes: 1160976, sha256: '7fabca2cc644b0383ec129861bba936885dce007c49ad18d92870a888b001194' },
  { name: 'trios-seasons-poster-v1.webp', bytes: 78918, sha256: 'a5e2498e69a7e2fb8cf90617d1378948092fd32ba603d06fac80586c0ea17b13' },
];
const checksum = bytes => createHash('sha256').update(bytes).digest('hex');
const valid = (bytes, asset) => bytes.length === asset.bytes && checksum(bytes) === asset.sha256;

for (const asset of assets) {
  const destination = fileURLToPath(new URL('../public/films/' + asset.name, import.meta.url));
  let existing;
  try { existing = await readFile(destination); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) {
    if (!valid(existing, asset)) throw new Error(`Film integrity check failed for ${asset.name}. Review the asset and update its version and manifest deliberately.`);
    continue;
  }

  const url = `https://raw.githubusercontent.com/Emmanuelok/triosservices/${sourceCommit}/public/films/${asset.name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Unable to restore ${asset.name}: HTTP ${response.status}`);
  const content = Buffer.from(await response.arrayBuffer());
  if (!valid(content, asset)) throw new Error(`Downloaded film failed integrity verification: ${asset.name}`);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = destination + '.download';
  await writeFile(temporary, content);
  await rename(temporary, destination);
  console.log(`Restored verified film asset: ${asset.name}`);
}
