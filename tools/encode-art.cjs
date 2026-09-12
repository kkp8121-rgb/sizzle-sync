// Build-time format encoding only: preserves the ImageGen artwork and dimensions.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('./server.cjs');
const root = path.resolve(__dirname, '..');

(async () => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const name of ['chef', 'kitchen']) {
      const source = fs.existsSync(path.join(root, 'art-source', `${name}.png`)) ? 'art-source' : 'assets';
      await page.goto(`http://127.0.0.1:${server.address().port}/${source}/${name}.png`);
      const result = await page.evaluate(async () => {
        const image = document.querySelector('img'); await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(image, 0, 0);
        return { width: canvas.width, height: canvas.height, data: canvas.toDataURL('image/webp', .92) };
      });
      if (!result.data.startsWith('data:image/webp;base64,')) throw new Error('WebP encoder unavailable');
      const bytes = Buffer.from(result.data.split(',')[1], 'base64');
      fs.writeFileSync(path.join(root, 'assets', `${name}.webp`), bytes);
      console.log(`${name}: ${result.width} × ${result.height}, ${bytes.length} bytes`);
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
