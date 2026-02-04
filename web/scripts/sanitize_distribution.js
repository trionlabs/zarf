import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM dirname shim
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// usage: node scripts/sanitize_distribution.js <input-file> <contract-address>
const INPUT_FILE = process.argv[2] || 'static/distribution.json';
const ADDRESS = process.argv[3];

if (!ADDRESS) {
    console.error("❌ Error: Contract Address is required.");
    console.error("Usage: node scripts/sanitize_distribution.js <input-file> <contract-address>");
    process.exit(1);
}

// Resolve paths
const rootDir = path.resolve(__dirname, '..');
const inputPath = path.resolve(rootDir, INPUT_FILE);
const outputPath = path.resolve(rootDir, `static/distributions/${ADDRESS.toLowerCase()}.json`);

console.log(`READING: ${inputPath}`);

if (!fs.existsSync(inputPath)) {
    console.error(`❌ File not found: ${inputPath}`);
    process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');
const data = JSON.parse(raw);

// --- 1. Schedule Logic ---
// If schedule is missing, we defaulting to "Already Started / 0 Duration" (Immediate Unlock)
// Ideally this comes from the source generation, but for dev we default it.
const schedule = data.schedule || {
    vestingStart: Math.floor(Date.now() / 1000) - 86400, // Started yesterday
    cliffDuration: 0,
    vestingDuration: 0,
    vestingPeriod: 1
};

if (!data.schedule) {
    console.warn("⚠️  Warning: 'schedule' missing in input. Using default (Immediate Unlock).");
}

// --- 2. Commitments Transformation ---
const commitments = {};
const leaves = [];

if (Array.isArray(data.recipients)) {
    console.log(`Processing ${data.recipients.length} recipients...`);

    data.recipients.forEach(r => {
        // Calculate Unlock Time
        // For Discrete Vesting, usually different leaves have different times.
        // If the JSON lacks specific unlock times, we use the Schedule's start + cliff.
        const unlockTime = r.unlockTime || (schedule.vestingStart + schedule.cliffDuration);

        // Map Key: IdentityCommitment (The hash of Email + PIN)
        // Map Value: Public Metadata
        commitments[r.identityCommitment] = {
            amount: r.amount,
            unlockTime: unlockTime,
            index: r.leafIndex
        };

        leaves.push(r.leaf);
    });
} else if (data.commitments) {
    console.log("Data already seems to be in Map format.");
    Object.assign(commitments, data.commitments);
} else {
    console.error("❌ Error: Could not find 'recipients' array or 'commitments' map in input.");
    process.exit(1);
}

// --- 3. Output Generation ---
// Using the format required by distribution.ts: DistributionData
const output = {
    merkleRoot: data.merkleRoot,
    distributionId: data.distributionId, // Optional, but good to keep
    schedule: schedule,
    commitments: commitments,
    leaves: leaves // Optional legacy support
};

// Write to static/distributions
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`\n✅ SUCCESS! Public distribution file generated.`);
console.log(`   📂 Saved to: ${outputPath}`);
console.log(`   🔐 Privacy: Removed emails and salts.`);
console.log(`   📦 Commitments: ${Object.keys(commitments).length}`);
