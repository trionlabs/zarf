/**
 * CSV processor for whitelist files
 * Expected format: email,amount
 */

/**
 * Parse CSV content into array of { email, amount }
 */
export function parseCSV(content) {
  const lines = content.trim().split('\n');
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip header row if present
    if (i === 0 && line.toLowerCase().includes('email')) {
      continue;
    }

    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 2) {
      console.warn(`Skipping invalid line ${i + 1}: ${line}`);
      continue;
    }

    const [email, amountStr] = parts;

    // Validate email format (basic check)
    if (!email.includes('@')) {
      console.warn(`Skipping invalid email on line ${i + 1}: ${email}`);
      continue;
    }

    // Parse amount
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      console.warn(`Skipping invalid amount on line ${i + 1}: ${amountStr}`);
      continue;
    }

    entries.push({
      email: email.toLowerCase().trim(),
      amount,
    });
  }

  return entries;
}

/**
 * Normalize email for consistent hashing
 * - Lowercase
 * - Trim whitespace
 * - Remove dots from Gmail local part
 * - Remove plus addressing
 */
export function normalizeEmail(email) {
  let e = email.toLowerCase().trim();

  // Gmail: dots in local part are ignored
  if (e.endsWith('@gmail.com')) {
    const [local, domain] = e.split('@');
    e = local.replace(/\./g, '') + '@' + domain;
  }

  // Strip plus addressing: alice+tag@co.com → alice@co.com
  const plusIdx = e.indexOf('+');
  if (plusIdx > 0) {
    const atIdx = e.indexOf('@');
    e = e.slice(0, plusIdx) + e.slice(atIdx);
  }

  return e;
}

/**
 * Read a CSV file and return parsed entries
 */
export function readCSVFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const entries = parseCSV(content);
        resolve(entries);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Generate sample CSV content for testing
 */
export function generateSampleCSV() {
  return `email,amount
alice@example.com,1000
bob@example.com,2000
charlie@example.com,1500`;
}
