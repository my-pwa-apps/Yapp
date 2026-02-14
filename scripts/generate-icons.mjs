import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dirname, '..', 'public', 'icons');

const svg192 = readFileSync(resolve(iconsDir, 'icon-192.svg'));
const svg512 = readFileSync(resolve(iconsDir, 'icon-512.svg'));

await sharp(svg192).resize(192, 192).png().toFile(resolve(iconsDir, 'icon-192.png'));
console.log('✓ icon-192.png');

await sharp(svg512).resize(512, 512).png().toFile(resolve(iconsDir, 'icon-512.png'));
console.log('✓ icon-512.png');

console.log('Done!');
