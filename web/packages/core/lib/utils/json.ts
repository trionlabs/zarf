/**
 * JSON serialization helper that handles BigInt values.
 * Used for persisting state involved with Crypto/Web3 values.
 */

export function safeStringify(value: any): string {
    return JSON.stringify(value, (_, v) =>
        typeof v === 'bigint' ? { __type: 'bigint', value: v.toString() } : v
    );
}

export function safeParse(text: string): any {
    return JSON.parse(text, (_, v) => {
        if (v && typeof v === 'object' && v.__type === 'bigint') {
            return BigInt(v.value);
        }
        return v;
    });
}
