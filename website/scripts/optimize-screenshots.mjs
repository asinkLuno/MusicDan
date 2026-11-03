import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = fileURLToPath(new URL('../public/screenshots/', import.meta.url));
const pngs = (await readdir(directory)).filter(name => name.endsWith('.png'));
if (!pngs.length) throw new Error('No PNG screenshots found to optimize');
for (const name of pngs) {
  const source = path.join(directory, name);
  const target = path.join(directory, name.replace(/\.png$/i, '.webp'));
  await sharp(source).webp({ quality: 88, effort: 6 }).toFile(target);
  await unlink(source);
}
console.log(`Optimized ${pngs.length} screenshots to WebP`);
