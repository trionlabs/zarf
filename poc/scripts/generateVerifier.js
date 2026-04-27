#!/usr/bin/env node
/**
 * Generate Solidity verifier from circuit using bb.js
 */

import { UltraHonkBackend } from '@aztec/bb.js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('Loading circuit...');
  const circuitPath = resolve(__dirname, '../public/circuits/zarf.json');
  const circuit = JSON.parse(readFileSync(circuitPath, 'utf-8'));

  console.log('Initializing UltraHonk backend...');
  const backend = new UltraHonkBackend(circuit.bytecode);

  console.log('Generating Solidity verifier...');
  const verifier = await backend.getSolidityVerifier();

  const outputPath = resolve(__dirname, '../../contracts/src/HonkVerifier.sol');
  writeFileSync(outputPath, verifier);
  console.log(`Verifier written to: ${outputPath}`);

  await backend.destroy();
  console.log('Done!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
