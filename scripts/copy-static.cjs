// scripts/copy-static.cjs
const fs = require('fs'); const path = require('path');
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name); const d = path.join(dest, entry.name);
    if (entry.isDirectory()) { if (entry.name === 'shared') continue; copyRecursive(s, d); }
    else if (entry.name === 'function.json') { fs.copyFileSync(s, d); }
  }
}
fs.copyFileSync('host.json', 'dist/host.json');
fs.copyFileSync('openapi.yaml', 'dist/openapi.yaml');
copyRecursive('src', 'dist');
console.log('Static assets copied to dist');
