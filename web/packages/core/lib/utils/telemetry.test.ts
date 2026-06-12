import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBeaconReporter, setupErrorTelemetry } from './telemetry';
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

describe('setupErrorTelemetry', () => {
    it('does nothing when no endpoint is provided', () => {
        const sendBeacon = vi.fn().mockReturnValue(true);
        vi.stubGlobal('navigator', { sendBeacon });
        setupErrorTelemetry({});
        // No reporter installed → the seam stays silent.
        expect(sendBeacon).not.toHaveBeenCalled();
    });
});
