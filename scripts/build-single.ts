// Inlines the production build into one self-contained HTML body fragment
// (dist/ortigia-single.html) for hosts that want a single file.
//   npm run build:single
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const jsPath = html.match(/src="\.\/(assets\/[^"]+\.js)"/)?.[1];
const cssPath = html.match(/href="\.\/(assets\/[^"]+\.css)"/)?.[1];
if (!jsPath || !cssPath) throw new Error('run `vite build` first');
const js = readFileSync(`dist/${jsPath}`, 'utf8');
const css = readFileSync(`dist/${cssPath}`, 'utf8');
if (js.includes('</script')) throw new Error('bundle contains </script');
const body = html.match(/<body>([\s\S]*?)<\/body>/)![1].replace(/<script[\s\S]*?<\/script>/g, '').trim();
writeFileSync('dist/ortigia-single.html', `<title>Ortigia</title>\n<style>${css}</style>\n${body}\n<script type="module">${js}</script>\n`);
console.log('wrote dist/ortigia-single.html');
