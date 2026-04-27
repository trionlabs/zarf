import { copyFileSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const publicWasmDir = join(rootDir, 'public', 'wasm');

// Fix broken sourcemaps in bb.js (they reference non-existent source files)
function stripBrokenSourcemaps() {
  const bbGeneratedDir = join(rootDir, 'node_modules', '@aztec', 'bb.js', 'dest', 'browser', 'cbind', 'generated');

  if (existsSync(bbGeneratedDir)) {
    const files = readdirSync(bbGeneratedDir);
    for (const file of files) {
      if (file.endsWith('.js')) {
        const filePath = join(bbGeneratedDir, file);
        let content = readFileSync(filePath, 'utf-8');
        if (content.includes('//# sourceMappingURL=')) {
          content = content.replace(/\/\/# sourceMappingURL=.*/g, '');
          writeFileSync(filePath, content);
          console.log(`Stripped broken sourcemap from ${file}`);
        }
      }
    }
  }
}

stripBrokenSourcemaps();

// Ensure the public/wasm directory exists
if (!existsSync(publicWasmDir)) {
  mkdirSync(publicWasmDir, { recursive: true });
}

// Copy WASM files from @noir-lang packages
const packages = [
  { name: '@noir-lang/acvm_js', subdir: 'web' },
  { name: '@noir-lang/noirc_abi', subdir: 'web' },
];

for (const pkg of packages) {
  const pkgDir = join(rootDir, 'node_modules', pkg.name, pkg.subdir);

  if (existsSync(pkgDir)) {
    const files = readdirSync(pkgDir);
    for (const file of files) {
      if (file.endsWith('.wasm') || file.endsWith('.wasm.gz')) {
        const src = join(pkgDir, file);
        const dest = join(publicWasmDir, file);
        copyFileSync(src, dest);
        console.log(`Copied ${file} to public/wasm/`);
      }
    }
  }
}

// Copy the compiled circuit
const circuitSrc = join(rootDir, '..', 'circuits', 'target', 'zarf.json');
const circuitDest = join(rootDir, 'public', 'circuits', 'zarf.json');

if (existsSync(circuitSrc)) {
  mkdirSync(dirname(circuitDest), { recursive: true });
  copyFileSync(circuitSrc, circuitDest);
  console.log('Copied zarf.json to public/circuits/');
} else {
  console.warn('Warning: circuits/target/zarf.json not found. Run "nargo build" in the circuits directory first.');
}

console.log('WASM and circuit files copied successfully!');
