import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = fileURLToPath(new URL('../public/screenshots/', import.meta.url));
const widths = [540, 810, 1080];
const pngs = (await readdir(directory)).filter((name) => name.endsWith('.png'));
if (!pngs.length) throw new Error('No PNG screenshots found to optimize');
for (const name of pngs) {
  const base = name.replace(/\.png$/i, '');
  const source = path.join(directory, name);
  for (const width of widths) {
    await sharp(source)
      .resize({ width })
      .avif({ quality: 55, effort: 6 })
      .toFile(path.join(directory, `${base}-${width}.avif`));
    await sharp(source)
      .resize({ width })
      .webp({ quality: 88, effort: 6 })
      .toFile(path.join(directory, `${base}-${width}.webp`));
  }
  await unlink(source);
}
console.log(`Optimized ${pngs.length} screenshots into AVIF/WebP variants`);
