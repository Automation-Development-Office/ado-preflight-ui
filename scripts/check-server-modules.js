'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'server.js');
const source = fs.readFileSync(serverPath, 'utf8');
const specs = [...source.matchAll(/require\(\s*(['"])(\.[^'"]+)\1\s*\)/g)].map((match) => match[2]);
const unique = [...new Set(specs)];

if (unique.length === 0) {
  console.error('server.js has no local require() calls to check');
  process.exit(1);
}

let failed = 0;
for (const spec of unique) {
  try {
    const resolved = require.resolve(spec, { paths: [root] });
    require(resolved);
    console.log(`ok ${spec}`);
  } catch (err) {
    failed += 1;
    console.error(`MISSING ${spec}: ${err.message}`);
  }
}

if (failed > 0) {
  process.exit(1);
}
