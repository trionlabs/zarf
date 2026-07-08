<script lang="ts">
    import { goto, invalidateAll } from '$app/navigation';
    import type { PageData } from './$types';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenInput from '@zarf/ui/components/ui/ZenInput.svelte';
    import ZenBadge from '@zarf/ui/components/ui/ZenBadge.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';
    import ZenSpinner from '@zarf/ui/components/ui/ZenSpinner.svelte';

    let { data }: { data: PageData } = $props();

    // Row/signup shapes derived from the load contract (no server-only imports).
    type UserRow = PageData['users'][number];

    // ─── Gate-aware section visibility (matches admin/+page.server.ts) ──────
    const showX = $derived(data.gateMode === 'x-follow' || data.gateMode === 'email+x');
    const showEmail = $derived(data.gateMode === 'email' || data.gateMode === 'email+x');

    // ─── Local UI state ────────────────────────────────────────────────────
    type Filter = 'all' | 'pending' | 'verified' | 'unattested';
    let filter = $state<Filter>('all');
    let query = $state('');
    let verifying = $state<Record<string, boolean>>({});
    let deleting = $state<Record<string, boolean>>({});
    let signingOut = $state(false);
    let sweeping = $state(false);
    let reverifying = $state(false);
    let exportingEmails = $state(false);
    let exportingUsers = $state(false);
    let error = $state('');
    let sweepResult = $state<{
        verified: number;
        unverified: number;
        pending: number;
        followers_fetched?: number;
    } | null>(null);
    let reverifyResult = $state<{ checked: number; cleared: number; transient: number } | null>(
        null,
    );

    // Pending attesters awaiting a follower sweep (drives the cost hint).
    const pending = $derived(Math.max(0, data.stats.attested - data.stats.verified));

    // Funnel stat tiles. Eligible is rendered separately with a primary accent —
    // it's the LIVE headline metric now (consent + >=1 identity). Completed is the
    // FROZEN legacy 4-step count; kept for regression parity but demoted to a plain
    // tile and relabelled so it no longer reads as THE funnel-done number.
    const funnelTiles: Array<[string, number]> = $derived([
        ['Logged in', data.stats.total],
        ['Attested', data.stats.attested],
        ['Follow-verified', data.stats.verified],
        ['Posted (opt.)', data.stats.postVerified],
        ['Completed (legacy)', data.stats.completed],
    ]);

    // Optimistic local copy so manual verify / delete re-render immediately;
    // invalidateAll() re-syncs the authoritative list + stats on completion.
    let rows = $derived(data.users);

    const FILTERS: ReadonlyArray<[Filter, string]> = [
        ['all', ''],
        ['unattested', 'Unattested'],
        ['pending', 'Pending verify'],
        ['verified', 'Verified'],
    ];

    const visible = $derived.by(() => {
        const q = query.trim().toLowerCase();
        return rows
            .filter((u) => {
                if (filter === 'pending') return !!u.follow_attested_at && !u.follow_verified_at;
                if (filter === 'verified') return !!u.follow_verified_at;
                if (filter === 'unattested') return !u.follow_attested_at;
                return true;
            })
            .filter((u) => {
                if (!q) return true;
                return (
                    u.username.toLowerCase().includes(q) ||
                    (u.name?.toLowerCase().includes(q) ?? false) ||
                    u.x_user_id.includes(q)
                );
            });
    });

    // ─── Helpers ───────────────────────────────────────────────────────────
    function fmtDate(ms: number | null): string {
        if (!ms) return '—';
        return new Date(ms).toLocaleString();
    }

    // Truncate a 56-char Stellar G-address to first6…last4 (full value in CSV).
    function truncWallet(addr: string | null): string {
        if (!addr) return '—';
        return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
    }

    function userState(u: UserRow): 'verified' | 'pending' | 'unattested' {
        if (u.follow_verified_at) return 'verified';
        if (u.follow_attested_at) return 'pending';
        return 'unattested';
    }

    const stateVariant = {
        verified: 'success',
        pending: 'warning',
        unattested: 'default',
    } as const;

    // LIVE airdrop eligibility. Mirrors isEligible() in $lib/server/db.ts (the
    // source of truth) — that module is server-only ($lib/server/*), so it cannot
    // be imported into this client component; the predicate is trivial enough to
    // restate. Derived, not a mirror of eligible_at: a wallet reclaim can drop a
    // row back out of the eligible set.
    function isLiveEligible(u: UserRow): boolean {
        return u.consent_at !== null && (u.email !== null || u.stellar_address !== null);
    }

    // Wallet ownership state: a signature-proven wallet (✦, biggest points boost)
    // supersedes a bare pasted address (unproven), which supersedes none.
    function walletState(u: UserRow): 'verified' | 'pasted' | 'none' {
        if (u.wallet_sig_verified_at) return 'verified';
        if (u.stellar_address) return 'pasted';
        return 'none';
    }

    // ─── Actions (same endpoints the standalone used) ──────────────────────
    async function signOut() {
        if (signingOut) return;
        signingOut = true;
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (err) {
            console.error('Logout failed:', err);
        } finally {
            // Hard nav: layout guard re-runs with cleared cookie → bounced to /
            await goto('/', { invalidateAll: true });
        }
    }

    async function exportEmails() {
        if (exportingEmails) return;
        exportingEmails = true;
        error = '';
        try {
            const res = await fetch('/admin/api/export-emails', { method: 'POST' });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { message?: string };
                throw new Error(body.message || `server ${res.status}`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'zarf-early-emails.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err: unknown) {
            error = err instanceof Error ? err.message : String(err);
        } finally {
            exportingEmails = false;
        }
    }

    // Users CSV is now POST (origin-guarded) because it carries PII — fetch +
    // blob download, mirroring exportEmails.
    async function exportUsers() {
        if (exportingUsers) return;
        exportingUsers = true;
        error = '';
        try {
            const res = await fetch('/admin/api/export', { method: 'POST' });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { message?: string };
                throw new Error(body.message || `server ${res.status}`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'zarf-early-users.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err: unknown) {
            error = err instanceof Error ? err.message : String(err);
        } finally {
            exportingUsers = false;
        }
    }

    async function runSweep() {
        if (sweeping) return;
        if (
            !confirm(
                `Run a follower sweep? This fetches every @${data.brand.handle} follower from X (~$0.001 per follower) and verifies all pending attesters.`,
            )
        ) {
            return;
        }
        sweeping = true;
        error = '';
        sweepResult = null;
        try {
            const res = await fetch('/admin/api/run-verify', { method: 'POST' });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { message?: string };
                throw new Error(body.message || `server ${res.status}`);
            }
            sweepResult = (await res.json()) as typeof sweepResult;
            await invalidateAll();
        } catch (err: unknown) {
            error = err instanceof Error ? err.message : String(err);
        } finally {
            sweeping = false;
        }
    }

    async function reverifyPosts() {
        if (reverifying) return;
        if (
            !confirm(
                'Re-checks every verified post via oEmbed (free). Posts that were deleted or edited lose verification. Continue?',
            )
        ) {
            return;
        }
        reverifying = true;
        error = '';
        reverifyResult = null;
        try {
            const res = await fetch('/admin/api/reverify-posts', { method: 'POST' });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { message?: string };
                throw new Error(body.message || `server ${res.status}`);
            }
            reverifyResult = (await res.json()) as typeof reverifyResult;
            await invalidateAll();
        } catch (err: unknown) {
            error = err instanceof Error ? err.message : String(err);
        } finally {
            reverifying = false;
        }
    }

    async function deleteUser(u: UserRow) {
        if (deleting[u.id]) return;
        if (
            !confirm(
                `Permanently delete @${u.username}? This erases their row, email, wallet, and sessions (KVKK scrub) and cannot be undone.`,
            )
        ) {
            return;
        }
        deleting = { ...deleting, [u.id]: true };
        error = '';
        try {
            const res = await fetch('/admin/api/delete-user', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ userId: u.id }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { message?: string };
                throw new Error(body.message || `server ${res.status}`);
            }
            rows = rows.filter((r) => r.id !== u.id);
            await invalidateAll();
        } catch (err: unknown) {
            error = err instanceof Error ? err.message : String(err);
        } finally {
            deleting = { ...deleting, [u.id]: false };
        }
    }

    async function manualVerify(id: string) {
        if (verifying[id]) return;
        verifying = { ...verifying, [id]: true };
        error = '';
        try {
            const res = await fetch('/admin/api/verify', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { message?: string };
                throw new Error(body.message || `server ${res.status}`);
            }
            const body = (await res.json()) as { user: UserRow };
            rows = rows.map((r) => (r.id === body.user.id ? body.user : r));
        } catch (err: unknown) {
            error = err instanceof Error ? err.message : String(err);
        } finally {
            verifying = { ...verifying, [id]: false };
        }
    }
</script>

<svelte:head>
    <title>Admin — {data.brand.name} Waitlist</title>
    <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<section class="container mx-auto max-w-7xl px-6 py-12 font-sans lg:py-16">
    <!-- Header -->
    <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
            <p class="text-xs font-medium uppercase tracking-[0.2em] text-primary">Admin</p>
            <h1 class="mt-1 text-3xl font-bold tracking-tight text-base-content">Waitlist</h1>
        </div>
        <div class="flex flex-wrap items-center gap-4 text-xs text-base-content/60">
            {#if data.admin && 'username' in data.admin && data.admin.username}
                <span
                    >Logged in as <strong class="text-base-content/80"
                        >@{data.admin.username}</strong
                    ></span
                >
            {:else}
                <span>Logged in</span>
            {/if}
            <a href="/" class="transition-colors hover:text-base-content">← Back to site</a>
            <ZenButton
                type="button"
                variant="ghost"
                size="xs"
                loading={signingOut}
                disabled={signingOut}
                onclick={signOut}
            >
                Sign out
            </ZenButton>
        </div>
    </header>

    {#if error}
        <div class="mt-6">
            <ZenAlert variant="error">Error: {error}</ZenAlert>
        </div>
    {/if}

    <!-- ─── Email signups ─────────────────────────────────────────────── -->
    {#if showEmail}
        <section class="mt-10">
            <h2 class="text-xl font-bold tracking-tight text-base-content">Email signups</h2>

            <div class="mt-4 grid grid-cols-2 gap-4">
                <ZenCard variant="glass" padding="md" radius="xl">
                    <span
                        class="block text-[11px] font-medium uppercase tracking-[0.15em] text-base-content/50"
                    >
                        Total
                    </span>
                    <span
                        class="mt-2 block text-3xl font-bold tabular-nums tracking-tight text-base-content"
                    >
                        {data.emailStats.total}
                    </span>
                </ZenCard>
                <ZenCard
                    variant="glass"
                    padding="md"
                    radius="xl"
                    class="ring-1 ring-inset ring-primary/20"
                >
                    <span
                        class="block text-[11px] font-medium uppercase tracking-[0.15em] text-base-content/50"
                    >
                        Confirmed
                    </span>
                    <span
                        class="mt-2 block text-3xl font-bold tabular-nums tracking-tight text-primary"
                    >
                        {data.emailStats.confirmed}
                    </span>
                </ZenCard>
            </div>

            <div class="mt-4">
                <ZenButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={exportingEmails}
                    disabled={exportingEmails}
                    onclick={exportEmails}
                >
                    Export emails CSV
                </ZenButton>
            </div>

            <ZenCard variant="glass" padding="none" radius="2xl" class="mt-4 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="bg-base-content/[0.03] text-left">
                                <th
                                    class="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-base-content/50"
                                    >Email</th
                                >
                                <th
                                    class="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-base-content/50"
                                    >Created</th
                                >
                                <th
                                    class="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-base-content/50"
                                    >Confirmed</th
                                >
                                <th
                                    class="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-base-content/50"
                                    >Source</th
                                >
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.emailSignups as s (s.id)}
                                <tr
                                    class="border-t border-base-content/5 transition-colors hover:bg-base-content/[0.03]"
                                >
                                    <td class="px-4 py-3 font-mono text-xs text-base-content"
                                        >{s.email}</td
                                    >
                                    <td
                                        class="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-base-content/60"
                                        >{fmtDate(s.created_at)}</td
                                    >
                                    <td
                                        class="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-base-content/60"
                                        >{fmtDate(s.confirmed_at)}</td
                                    >
                                    <td class="px-4 py-3 text-xs text-base-content/60"
                                        >{s.source ?? '—'}</td
                                    >
                                </tr>
                            {/each}
                            {#if data.emailSignups.length === 0}
                                <tr
                                    ><td
                                        colspan="4"
                                        class="px-4 py-10 text-center text-sm text-base-content/50"
                                        >No email signups yet.</td
                                    ></tr
                                >
                            {/if}
                        </tbody>
                    </table>
                </div>
            </ZenCard>
        </section>
    {/if}

    <!-- ─── X funnel ──────────────────────────────────────────────────── -->
    {#if showX}
        <div class="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {#each funnelTiles as [label, value] (label)}
                <ZenCard variant="glass" padding="md" radius="xl">
                    <span
                        class="block text-[11px] font-medium uppercase tracking-[0.15em] text-base-content/50"
                        >{label}</span
                    >
                    <span
                        class="mt-2 block text-3xl font-bold tabular-nums tracking-tight text-base-content"
                        >{value}</span
                    >
                </ZenCard>
            {/each}
            <ZenCard
                variant="glass"
                padding="md"
                radius="xl"
                class="ring-1 ring-inset ring-primary/20"
            >
                <span
                    class="block text-[11px] font-medium uppercase tracking-[0.15em] text-base-content/50"
                    >Eligible</span
                >
                <span class="mt-2 block text-3xl font-bold tabular-nums tracking-tight text-primary"
                    >{data.stats.eligible}</span
                >
            </ZenCard>
        </div>

        <!-- Toolbar -->
        <div class="mt-6 flex flex-wrap items-center gap-3">
            <div class="min-w-[220px] flex-1">
                <ZenInput
                    type="search"
                    placeholder="Search username, name, or X id"
                    bind:value={query}
                />
            </div>

            <div class="flex flex-wrap gap-2">
                {#each FILTERS as [val, label] (val)}
                    <button
                        type="button"
                        class="rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors
                            {filter === val
                            ? 'border-primary bg-primary text-primary-content'
                            : 'border-base-content/10 text-base-content/60 hover:border-base-content/20 hover:text-base-content'}"
                        onclick={() => (filter = val)}
                    >
                        {val === 'all' ? `All (${rows.length})` : label}
                    </button>
                {/each}
            </div>

            <ZenButton
                type="button"
                variant="secondary"
                size="sm"
                loading={sweeping}
                disabled={sweeping}
                onclick={runSweep}
                title={`Fetch @${data.brand.handle} followers from X and verify all pending attesters`}
            >
                Run sweep
            </ZenButton>
            <ZenButton
                type="button"
                variant="secondary"
                size="sm"
                loading={reverifying}
                disabled={reverifying}
                onclick={reverifyPosts}
                title="Re-check every verified post via oEmbed (free) and revoke ones that no longer pass"
            >
                Re-verify posts
            </ZenButton>
            <ZenButton
                type="button"
                variant="secondary"
                size="sm"
                loading={exportingUsers}
                disabled={exportingUsers}
                onclick={exportUsers}
            >
                Export CSV
            </ZenButton>
        </div>

        <!-- Cost hint -->
        <div class="mt-3 flex items-center gap-2 font-mono text-xs text-base-content/50">
            {#if sweeping || reverifying}
                <ZenSpinner size="xs" />
            {/if}
            <span
                >{pending} pending · sweep fetches ALL followers of @{data.brand.handle} (~$0.001/follower)</span
            >
        </div>

        {#if sweepResult}
            <div class="mt-4">
                <ZenAlert variant="success">
                    Sweep complete — pending {sweepResult.pending}, verified {sweepResult.verified},
                    still unverified {sweepResult.unverified}{#if sweepResult.followers_fetched != null},
                        fetched {sweepResult.followers_fetched}
                        followers from X{/if}.
                </ZenAlert>
            </div>
        {/if}

        {#if reverifyResult}
            <div class="mt-4">
                <ZenAlert variant="success">
                    Post re-verify complete — checked {reverifyResult.checked}, cleared {reverifyResult.cleared},
                    transient {reverifyResult.transient}.
                </ZenAlert>
            </div>
        {/if}

        <!-- Users table -->
        <ZenCard variant="glass" padding="none" radius="2xl" class="mt-6 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="bg-base-content/[0.03] text-left">
                            {#each ['User', 'State', 'Created', 'Attested', 'Verified', 'Post', 'Wallet', 'Email', 'Refs', 'Eligible', 'Attempts'] as h (h)}
                                <th
                                    class="whitespace-nowrap px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-base-content/50"
                                    >{h}</th
                                >
                            {/each}
                            <th class="px-4 py-3" aria-label="actions"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each visible as u (u.id)}
                            {@const state = userState(u)}
                            <tr
                                class="border-t border-base-content/5 transition-colors hover:bg-base-content/[0.03]"
                            >
                                <td class="px-4 py-3">
                                    <a
                                        href={`https://x.com/${u.username}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="group inline-flex items-center gap-2"
                                    >
                                        {#if u.profile_image_url}
                                            <img
                                                src={u.profile_image_url}
                                                alt=""
                                                class="h-7 w-7 rounded-full"
                                            />
                                        {:else}
                                            <span
                                                class="h-7 w-7 rounded-full bg-base-content/10"
                                                aria-hidden="true"
                                            ></span>
                                        {/if}
                                        <span class="flex flex-col leading-tight">
                                            <span
                                                class="font-semibold text-base-content group-hover:underline"
                                                >@{u.username}</span
                                            >
                                            {#if u.name}<span class="text-xs text-base-content/50"
                                                    >{u.name}</span
                                                >{/if}
                                        </span>
                                    </a>
                                </td>
                                <td class="px-4 py-3">
                                    <ZenBadge variant={stateVariant[state]} size="sm"
                                        >{state}</ZenBadge
                                    >
                                </td>
                                <td
                                    class="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-base-content/60"
                                    >{fmtDate(u.created_at)}</td
                                >
                                <td
                                    class="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-base-content/60"
                                    >{fmtDate(u.follow_attested_at)}</td
                                >
                                <td
                                    class="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-base-content/60"
                                    >{fmtDate(u.follow_verified_at)}</td
                                >
                                <td class="px-4 py-3">
                                    {#if u.post_verified_at && u.post_url}
                                        <a
                                            href={u.post_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            class="font-bold text-zen-success hover:underline"
                                            title={`View post — verified ${fmtDate(u.post_verified_at)}`}
                                            >✓</a
                                        >
                                    {:else if u.post_verified_at}
                                        <span
                                            class="font-bold text-zen-success"
                                            title={fmtDate(u.post_verified_at)}>✓</span
                                        >
                                    {:else}
                                        <span class="text-base-content/40">—</span>
                                    {/if}
                                </td>
                                <td
                                    class="whitespace-nowrap px-4 py-3 font-mono text-xs text-base-content/60"
                                    title={u.stellar_address ?? ''}
                                >
                                    {#if walletState(u) === 'verified'}
                                        <span class="inline-flex items-center gap-1">
                                            <span
                                                class="text-zen-success"
                                                title={`Signature-verified ${fmtDate(u.wallet_sig_verified_at)}`}
                                                aria-label="signature-verified">✦</span
                                            >
                                            <span>{truncWallet(u.stellar_address)}</span>
                                        </span>
                                    {:else if walletState(u) === 'pasted'}
                                        <span
                                            class="inline-flex items-center gap-1 text-base-content/40"
                                            title="Pasted address — ownership NOT proven"
                                        >
                                            <span aria-label="pasted, unverified">•</span>
                                            <span>{truncWallet(u.stellar_address)}</span>
                                        </span>
                                    {:else}
                                        <span class="text-base-content/40">—</span>
                                    {/if}
                                </td>
                                <td
                                    class="max-w-[22ch] overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3 font-mono text-xs text-base-content/60"
                                    >{u.email ?? '—'}</td
                                >
                                <td class="px-4 py-3 text-right tabular-nums text-base-content"
                                    >{u.referral_count}</td
                                >
                                <td class="px-4 py-3">
                                    {#if isLiveEligible(u)}
                                        <span
                                            class="font-bold text-zen-success"
                                            title={u.eligible_at
                                                ? `Eligible since ${fmtDate(u.eligible_at)}`
                                                : 'Live-eligible (consent + ≥1 identity)'}>✓</span
                                        >
                                    {:else}
                                        <span
                                            class="text-base-content/40"
                                            title="Not eligible — needs consent + email or wallet"
                                            >—</span
                                        >
                                    {/if}
                                </td>
                                <td class="px-4 py-3 text-right tabular-nums text-base-content/60"
                                    >{u.follow_attempt_count}</td
                                >
                                <td class="whitespace-nowrap px-4 py-3 text-right">
                                    <div class="inline-flex items-center gap-2">
                                        {#if state !== 'verified'}
                                            <ZenButton
                                                type="button"
                                                variant="primary"
                                                size="xs"
                                                loading={verifying[u.id]}
                                                disabled={verifying[u.id]}
                                                onclick={() => manualVerify(u.id)}
                                            >
                                                Verify now
                                            </ZenButton>
                                        {/if}
                                        <ZenButton
                                            type="button"
                                            variant="danger"
                                            size="xs"
                                            loading={deleting[u.id]}
                                            disabled={deleting[u.id]}
                                            onclick={() => deleteUser(u)}
                                        >
                                            Delete
                                        </ZenButton>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                        {#if visible.length === 0}
                            <tr
                                ><td
                                    colspan="12"
                                    class="px-4 py-10 text-center text-sm text-base-content/50"
                                    >No users match the current filter.</td
                                ></tr
                            >
                        {/if}
                    </tbody>
                </table>
            </div>
        </ZenCard>
    {/if}
</section>
