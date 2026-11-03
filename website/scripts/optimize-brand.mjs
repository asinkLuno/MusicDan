import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = fileURLToPath(new URL('../public/brand/', import.meta.url));
const source = fileURLToPath(new URL('../../docs/brand/app-icon/icon.svg', import.meta.url));
await mkdir(directory, { recursive: true });
await sharp(source).resize(128, 128).webp({ quality: 90, effort: 6 }).toFile(path.join(directory, 'icon-128.webp'));
await sharp(source).resize(64, 64).png({ compressionLevel: 9 }).toFile(path.join(directory, 'favicon-64.png'));
console.log('Generated brand icon assets');
