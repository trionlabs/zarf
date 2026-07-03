<script lang="ts">
    import { brand } from '$lib/brand';
</script>

<svelte:head>
    <title>Privacy — {brand.name}</title>
    <meta
        name="description"
        content="How Zarf handles your data on the early access waitlist."
    />
</svelte:head>

<article class="mx-auto max-w-prose px-6 py-20 font-sans text-base-content sm:py-24">
    <a
        href="/"
        class="mb-8 inline-block text-xs font-medium uppercase tracking-[0.2em] text-base-content/50 transition-colors hover:text-base-content"
    >
        ← Back
    </a>

    <p class="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-primary">
        Zarf early access
    </p>
    <h1 class="mb-4 text-3xl font-bold tracking-tight text-base-content sm:text-4xl">
        Privacy Notice
    </h1>
    <p class="mb-12 text-lg leading-snug text-base-content/70">
        This explains what we collect when you join the {brand.name} early access waitlist, why, and
        the choices you have. It's deliberately short.
    </p>

    <!-- ─── English ─────────────────────────────────────────────── -->
    <section class="mb-10">
        <h2 class="mb-3 text-xl font-bold text-base-content">Data controller</h2>
        <p class="text-base leading-relaxed text-base-content/70">
            {brand.name} / TrionLabs. Questions or requests:
            <a
                href="mailto:{brand.supportEmail}"
                class="text-base-content underline decoration-base-content/30 underline-offset-2 hover:decoration-base-content"
                >{brand.supportEmail}</a
            >.
        </p>
    </section>

    <section class="mb-10">
        <h2 class="mb-3 text-xl font-bold text-base-content">What we store</h2>
        <ul class="list-disc space-y-2 pl-5 text-base leading-normal text-base-content/70 marker:text-base-content/40">
            <li>Your public X profile (handle, display name, avatar, follower count).</li>
            <li>The email address you give us at the final step.</li>
            <li>Your Stellar wallet address.</li>
            <li>
                We do <strong class="font-semibold text-base-content">not</strong> store your IP address or
                browser user-agent against your waitlist entry. Cloudflare processes them at the network edge
                for security, and our admin security log records an IP only for privileged admin actions and
                failed admin-panel logins (abuse prevention).
            </li>
        </ul>
    </section>

    <section class="mb-10">
        <h2 class="mb-3 text-xl font-bold text-base-content">Why</h2>
        <p class="text-base leading-relaxed text-base-content/70">
            To run the waitlist, keep it free of bots, and deliver your beta tester airdrop to your email
            when we launch. We do not sell your data, and we never DM you or ask for your secret key.
        </p>
    </section>

    <section class="mb-10">
        <h2 class="mb-3 text-xl font-bold text-base-content">Processors</h2>
        <p class="text-base leading-relaxed text-base-content/70">
            <strong class="font-semibold text-base-content">Cloudflare</strong> (hosting, storage, and rate-limiting) and
            <strong class="font-semibold text-base-content">X</strong>
            (for sign-in / OAuth and verifying your follow). No other tracking or analytics beyond that.
        </p>
    </section>

    <section class="mb-10">
        <h2 class="mb-3 text-xl font-bold text-base-content">Your rights</h2>
        <p class="text-base leading-relaxed text-base-content/70">
            You can request access to, correction of, or deletion of your data at any time by emailing
            <a
                href="mailto:{brand.supportEmail}"
                class="text-base-content underline decoration-base-content/30 underline-offset-2 hover:decoration-base-content"
                >{brand.supportEmail}</a
            >. Deletion removes your email,
            wallet address, and IP/user-agent from our records.
        </p>
    </section>

    <!-- ─── Türkçe (kısa) ───────────────────────────────────────── -->
    <section class="mt-2 border-t border-base-content/10 pt-10">
        <h2 class="mb-3 text-xl font-bold text-base-content">Türkçe — Kısa Bilgilendirme</h2>
        <p class="mb-3 text-base leading-relaxed text-base-content/70">
            <strong class="font-semibold text-base-content">Veri sorumlusu:</strong> {brand.name} / TrionLabs —
            <a
                href="mailto:{brand.supportEmail}"
                class="text-base-content underline decoration-base-content/30 underline-offset-2 hover:decoration-base-content"
                >{brand.supportEmail}</a
            >.
        </p>
        <p class="mb-3 text-base leading-relaxed text-base-content/70">
            <strong class="font-semibold text-base-content">Sakladıklarımız:</strong> herkese açık X profiliniz, e-posta adresiniz, Stellar cüzdan
            adresiniz ve yalnızca hız sınırlama için IP/tarayıcı bilgisi (en fazla 30 gün).
        </p>
        <p class="mb-3 text-base leading-relaxed text-base-content/70">
            <strong class="font-semibold text-base-content">Amaç:</strong> bekleme listesini yürütmek, botları önlemek ve lansmanda beta tester
            airdrop'unuzu e-postanıza ulaştırmak. Verinizi satmayız; size asla DM atmaz veya gizli
            anahtarınızı istemeyiz.
        </p>
        <p class="mb-3 text-base leading-relaxed text-base-content/70">
            <strong class="font-semibold text-base-content">İşleyenler:</strong> Cloudflare (barındırma/depolama) ve X (giriş/OAuth). Bunun
            dışında takip yoktur.
        </p>
        <p class="mb-3 text-base leading-relaxed text-base-content/70">
            <strong class="font-semibold text-base-content">Haklarınız:</strong> verilerinize erişme, düzeltme ve silme talebinizi
            <a
                href="mailto:{brand.supportEmail}"
                class="text-base-content underline decoration-base-content/30 underline-offset-2 hover:decoration-base-content"
                >{brand.supportEmail}</a
            > adresine iletebilirsiniz.
        </p>
    </section>
</article>
