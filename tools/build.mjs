import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
await build({ entryPoints: [path.join(root, 'src/app.js')], outfile: path.join(root, 'game.js'), bundle: true, format: 'iife', target: ['es2020'], minify: true, legalComments: 'eof', logLevel: 'info' });
