import { computeIdentityCommitment } from '../src/lib/crypto/merkleTree';
import fs from 'fs';
import path from 'path';

async function verify() {
    const email = "yamancandev@gmail.com";
    const pin = "S6LCtWMy";

    const jsonPath = path.resolve(process.cwd(), 'static/distributions/0x4ea075209bc0bcccd763c2609bccb789f3b55b16.json');
    const content = fs.readFileSync(jsonPath, 'utf-8');
    const data = JSON.parse(content);

    console.log("Testing epochs 0-5 for:", email);
    console.log("PIN:", pin);
    console.log("---");

    for (let epoch = 0; epoch < 6; epoch++) {
        const epochSecret = `${pin}_${epoch}`;
        const commitmentBigInt = await computeIdentityCommitment(email, epochSecret);
        const commitment = '0x' + commitmentBigInt.toString(16).padStart(64, '0');

        const exists = commitment in data.commitments;
        console.log(`Epoch ${epoch}: ${epochSecret}`);
        console.log(`  Commitment: ${commitment.slice(0, 20)}...`);
        console.log(`  Exists: ${exists ? '✅' : '❌'}`);
        if (exists) {
            console.log(`  Data:`, data.commitments[commitment]);
        }
        console.log();
    }
}

verify().catch(console.error);
