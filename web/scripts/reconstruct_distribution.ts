
import { processWhitelist, generateSecureCode } from '../src/lib/crypto/merkleTree';
import type { Schedule, DistributionData } from '../src/lib/types';
import fs from 'fs';
import path from 'path';

// Parse CSV
function parseCSV(filePath: string): { email: string; amount: bigint; pin: string }[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim() !== '');
    const headers = lines[0].split(',').map(h => h.trim());

    // Assume headers: email,pin
    const entries: { email: string; amount: bigint; pin: string }[] = [];

    // Total Amount per user (hardcoded for reconstruction to match previous roughly)
    const TOTAL_AMOUNT = 100n * 10n ** 18n; // 100 Tokens

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim());
        if (parts.length >= 2) {
            entries.push({
                email: parts[0],
                amount: TOTAL_AMOUNT,
                pin: parts[1]
            });
        }
    }
    return entries;
}

async function main() {
    console.log("Reconstructing distribution using Hash Chain secrets...");

    const csvPath = path.resolve(process.cwd(), '../test/secrets(1).csv'); // Adjusted for running from 'web' root
    // But if running from 'web', process.cwd() is '.../web'
    // test dir is sibling to web. '../test/secrets(1).csv'

    // Verify path
    const absoluteCsvPath = '/Users/yaman/dev/zarf/zarf/test/secrets(1).csv';

    if (!fs.existsSync(absoluteCsvPath)) {
        console.error("CSV not found at:", absoluteCsvPath);
        process.exit(1);
    }

    const entries = parseCSV(absoluteCsvPath);
    console.log(`Loaded ${entries.length} entries.`);

    // Schedule (Matching 0x4Ea...json)
    const schedule: Schedule = {
        vestingStart: 1767312000, // 2026-01-01 roughly?
        cliffDuration: 0,
        vestingDuration: 86400, // 1 day ??
        vestingPeriod: 3600,    // 1 hour
        // Total periods was 24 in JSON
        distributionDuration: 24,
        durationUnit: 'hours', // 3600s
        cliffEndDate: new Date(1767312000 * 1000).toISOString()
    };

    console.log("Schedule:", schedule);

    // Process
    const result = await processWhitelist(entries, schedule);

    console.log("Merkle Root:", '0x' + result.root.toString(16));

    // Format Output for JSON
    const distributionData: DistributionData = {
        merkleRoot: '0x' + result.root.toString(16),
        schedule: {
            vestingStart: schedule.vestingStart,
            cliffDuration: schedule.cliffDuration,
            vestingDuration: schedule.vestingDuration,
            vestingPeriod: schedule.vestingPeriod,
            totalPeriods: schedule.distributionDuration
        },
        leaves: result.claims.map(c => '0x' + c.leaf.toString(16)),
        commitments: {}
    };

    // Populate commitments map
    result.claims.forEach(c => {
        distributionData.commitments[c.identityCommitment] = {
            amount: c.amount.toString(),
            unlockTime: c.unlockTime,
            index: c.leafIndex
        };
    });

    const outputPath = path.resolve(process.cwd(), 'static/distributions/reconstructed_hashchain.json');
    fs.writeFileSync(outputPath, JSON.stringify(distributionData, null, 2));

    console.log("Success! Distribution written to:", outputPath);
}

main().catch(console.error);
