import { readFile, writeFile } from 'node:fs/promises';

const webRoot = new URL('../', import.meta.url);
const source = new URL('data/provider-availability.json', webRoot);
const portalCopy = new URL('../portal/apps/web/src/lib/provider-display-status.generated.json', webRoot);
const canonicalValue = JSON.parse(await readFile(source, 'utf8'));
const canonical = `${JSON.stringify(canonicalValue, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const generated = JSON.parse(await readFile(portalCopy, 'utf8'));
  if (JSON.stringify(generated) !== JSON.stringify(canonicalValue)) {
    console.error('Portal provider display-status copy is out of sync. Run npm run sync:provider-availability.');
    process.exit(1);
  }
  console.log('Provider availability copies are in sync.');
} else {
  await writeFile(portalCopy, canonical, 'utf8');
  console.log('Updated the checked-in portal provider display-status copy.');
}
