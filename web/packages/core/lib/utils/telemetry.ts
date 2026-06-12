/**
 * Concrete, dependency-free reporters for the `log.ts` telemetry seam.
 *
 * `createBeaconReporter` POSTs each warn/error event to an endpoint via
 * `navigator.sendBeacon` (falling back to `fetch` + keepalive). It is
 * vendor-neutral — point it at any collector, including one of this repo's own
 * Cloudflare Workers. It never throws.
 *
 * Nothing is wired by default. An app opts in at boot via `setupErrorTelemetry`
 * with an operator-provided endpoint; with no endpoint, it is a no-op and no
 * data leaves the device.
 */
import type { LogLevel, LogReporter } from './log';
import { setLogReporter } from './log';

export interface BeaconReporterOptions {
    /** Tag every event (e.g. 'create@mainnet') so the collector can group them. */
    context?: string;
    /** Levels to forward. Default: both 'warn' and 'error'. */
    levels?: LogLevel[];
}

function stringifyArg(arg: unknown): string {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    try {
        return JSON.stringify(arg);
    } catch {
        return String(arg);
    }
}

export function createBeaconReporter(
    endpoint: string,
    options: BeaconReporterOptions = {},
): LogReporter {
    const levels = options.levels ?? ['warn', 'error'];
    return (level, args) => {
        if (!levels.includes(level)) return;
        const payload = JSON.stringify({
            level,
            context: options.context,
            message: args.map(stringifyArg).join(' '),
            ts: new Date().toISOString(),
        });
        try {
            if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
                const blob = new Blob([payload], { type: 'application/json' });
                if (navigator.sendBeacon(endpoint, blob)) return;
            }
            if (typeof fetch === 'function') {
                void fetch(endpoint, {
                    method: 'POST',
                    body: payload,
                    headers: { 'content-type': 'application/json' },
                    keepalive: true,
                }).catch(() => {});
            }
        } catch {
            /* Telemetry must never break the app. */
        }
    };
}

/**
 * Wire warn/error telemetry from an operator-provided endpoint. No endpoint →
 * no-op (nothing is sent). Call once at app boot, after `configureCore`.
 */
export function setupErrorTelemetry(options: { endpoint?: string; context?: string } = {}): void {
    if (!options.endpoint) return;
    setLogReporter(createBeaconReporter(options.endpoint, { context: options.context }));
}
