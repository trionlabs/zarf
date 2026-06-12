import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBeaconReporter, redactTelemetry, setupErrorTelemetry } from './telemetry';
import { setLogReporter } from './log';

afterEach(() => {
    vi.unstubAllGlobals();
    setLogReporter(null);
});

describe('createBeaconReporter', () => {
    it('beacons the endpoint with the event payload', () => {
        const sendBeacon = vi.fn().mockReturnValue(true);
        vi.stubGlobal('navigator', { sendBeacon });
        const report = createBeaconReporter('https://collector.example/log', {
            context: 'create@mainnet',
        });

        report('error', ['Wallet connection failed', new Error('boom')]);

        expect(sendBeacon).toHaveBeenCalledOnce();
        const [url, blob] = sendBeacon.mock.calls[0];
        expect(url).toBe('https://collector.example/log');
        expect(blob).toBeInstanceOf(Blob);
    });

    it('filters out levels that are not configured', () => {
        const sendBeacon = vi.fn().mockReturnValue(true);
        vi.stubGlobal('navigator', { sendBeacon });
        const report = createBeaconReporter('https://collector.example/log', { levels: ['error'] });

        report('warn', ['just a warning']);
        expect(sendBeacon).not.toHaveBeenCalled();

        report('error', ['real error']);
        expect(sendBeacon).toHaveBeenCalledOnce();
    });

    it('falls back to fetch when sendBeacon is unavailable', () => {
        vi.stubGlobal('navigator', {});
        const fetchMock = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('fetch', fetchMock);
        const report = createBeaconReporter('https://collector.example/log');

        report('error', ['x']);
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', keepalive: true });
    });

    it('never throws even if the transport explodes', () => {
        vi.stubGlobal('navigator', {
            sendBeacon: () => {
                throw new Error('nope');
            },
        });
        const report = createBeaconReporter('https://collector.example/log');
        expect(() => report('error', ['x'])).not.toThrow();
    });
});

describe('redactTelemetry', () => {
    it('strips JWTs', () => {
        const jwt =
            'eyJhbGciOiJSUzI1NiIsImtpZCI6ImFiYyJ9.eyJlbWFpbCI6ImFsaWNlQGdtYWlsLmNvbSJ9.c2lnbmF0dXJl';
        expect(redactTelemetry(`Auth failed for token ${jwt} (expired)`)).toBe(
            'Auth failed for token [jwt] (expired)',
        );
    });

    it('strips email addresses', () => {
        expect(redactTelemetry('claim failed for alice.smith+x@googlemail.com today')).toBe(
            'claim failed for [email] today',
        );
    });

    it('caps oversized messages', () => {
        const result = redactTelemetry('x'.repeat(10_000));
        expect(result.length).toBeLessThan(2_100);
        expect(result.endsWith('…[truncated]')).toBe(true);
    });

    it('leaves ordinary messages untouched', () => {
        expect(redactTelemetry('RPC timeout after 10s for CABC123')).toBe(
            'RPC timeout after 10s for CABC123',
        );
    });
});

describe('beacon payload redaction', () => {
    it('redacts JWTs and emails before transport', async () => {
        const sendBeacon = vi.fn().mockReturnValue(true);
        vi.stubGlobal('navigator', { sendBeacon });
        const report = createBeaconReporter('https://collector.example/log');

        report('error', [
            'Claim failed:',
            new Error('token eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln for bob@example.com'),
        ]);

        const blob: Blob = sendBeacon.mock.calls[0][1];
        const body = await blob.text();
        expect(body).not.toContain('eyJhbGci');
        expect(body).not.toContain('bob@example.com');
        expect(body).toContain('[jwt]');
        expect(body).toContain('[email]');
    });
});

describe('setupErrorTelemetry', () => {
    it('does nothing when no endpoint is provided', () => {
        const sendBeacon = vi.fn().mockReturnValue(true);
        vi.stubGlobal('navigator', { sendBeacon });
        setupErrorTelemetry({});
        // No reporter installed → the seam stays silent.
        expect(sendBeacon).not.toHaveBeenCalled();
    });
});
