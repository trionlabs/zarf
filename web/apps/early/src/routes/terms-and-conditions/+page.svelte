<script lang="ts">
    import { brand } from '$lib/brand';
</script>

<svelte:head>
    <title>Terms — {brand.name}</title>
    <meta name="description" content="Terms for the Zarf early access waitlist." />
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
        Terms &amp; Conditions
    </h1>
    <p class="mb-12 text-lg leading-snug text-base-content/70">
        The rules for joining the {brand.name} early access waitlist. Deliberately short, like our
        <a
            href="/privacy"
            class="text-base-content underline decoration-base-content/30 underline-offset-2 hover:decoration-base-content"
            >privacy notice</a
        >.
    </p>

    <!-- ─── English ─────────────────────────────────────────────── -->
    <section class="mb-10">
        <h2 class="mb-3 text-xl font-bold text-base-content">What this is</h2>
        <p class="text-base leading-relaxed text-base-content/70">
            The waitlist at early.zarf.to registers you for
            <strong class="font-semibold text-base-content">beta tester early access</strong> to
            {brand.name}, a privacy-preserving airdrop tool on the Stellar network, operated by
            {brand.name} / TrionLabs. Joining is free.
        </p>
    </section>

    <section class="mb-10">
        <h2 class="mb-3 text-xl font-bold text-base-content">What you get — and don't</h2>
        <ul class="list-disc space-y-2 pl-5 text-base leading-normal text-base-content/70 marker:text-base-content/40">
            <li>A place in the beta tester queue and early access when we launch.</li>
            <li>
                <strong class="font-semibold text-base-content">No token, financial reward, or investment is promised or implied.</strong> A demo
                airdrop delivered through {brand.name} itself is a product trial, not compensation.
            </li>
            <li>Queue position and access timing may change; the beta may be limited, paused, or ended.</li>
        </ul>
    </section>

    <section class="mb-10">
        <h2 class="mb-3 text-xl font-bold text-base-content">Your part</h2>
        <ul class="list-disc space-y-2 pl-5 text-base leading-normal text-base-content/70 marker:text-base-content/40">
            <li>Use your own X account and your own Stellar wallet address — one entry per person.</li>
            <li>No bots, bulk accounts, or manipulation of the referral system. We may remove entries that do.</li>
            <li>We will never DM you first or ask for your secret key. Anyone who does is not us.</li>
        </ul>
    </section>

    <section class="mb-10">
        <h2 class="mb-3 text-xl font-bold text-base-content">No warranty</h2>
        <p class="text-base leading-relaxed text-base-content/70">
            The waitlist and beta are provided "as is", without warranties of any kind. To the maximum
            extent permitted by law, we are not liable for indirect or consequential damages arising from
            participation. Nothing here is financial, legal, or investment advice.
        </p>
    </section>

    <section class="mb-10">
        <h2 class="mb-3 text-xl font-bold text-base-content">Changes &amp; contact</h2>
        <p class="text-base leading-relaxed text-base-content/70">
            We may update these terms; the current version always lives at this URL. Questions:
            <a
                href="mailto:{brand.supportEmail}"
                class="text-base-content underline decoration-base-content/30 underline-offset-2 hover:decoration-base-content"
                >{brand.supportEmail}</a
            >.
        </p>
    </section>

    <!-- ─── Türkçe (kısa) ───────────────────────────────────────── -->
    <section class="mt-2 border-t border-base-content/10 pt-10">
        <h2 class="mb-3 text-xl font-bold text-base-content">Türkçe — Kısa Koşullar</h2>
        <p class="mb-3 text-base leading-relaxed text-base-content/70">
            <strong class="font-semibold text-base-content">Ne bu:</strong> early.zarf.to bekleme listesi, sizi {brand.name} beta tester erken
            erişimine kaydeder. Katılım ücretsizdir.
        </p>
        <p class="mb-3 text-base leading-relaxed text-base-content/70">
            <strong class="font-semibold text-base-content">Vaat edilen:</strong> beta erken erişim sırası. <strong class="font-semibold text-base-content">Token, finansal ödül veya
            yatırım vaadi yoktur.</strong> Lansmandaki demo airdrop bir ürün denemesidir, ödeme değildir.
        </p>
        <p class="mb-3 text-base leading-relaxed text-base-content/70">
            <strong class="font-semibold text-base-content">Sizden beklenen:</strong> kendi X hesabınız ve kendi Stellar cüzdanınızla tek kayıt;
            bot/çoklu hesap/referans manipülasyonu yok. İhlal eden kayıtlar silinebilir. Size asla önce DM
            atmayız, gizli anahtarınızı istemeyiz.
        </p>
        <p class="mb-3 text-base leading-relaxed text-base-content/70">
            <strong class="font-semibold text-base-content">Sorumluluk:</strong> liste ve beta "olduğu gibi" sunulur; yasaların izin verdiği
            ölçüde dolaylı zararlardan sorumluluk kabul edilmez. Finansal tavsiye değildir.
        </p>
        <p class="mb-3 text-base leading-relaxed text-base-content/70">
            <strong class="font-semibold text-base-content">İletişim:</strong>
            <a
                href="mailto:{brand.supportEmail}"
                class="text-base-content underline decoration-base-content/30 underline-offset-2 hover:decoration-base-content"
                >{brand.supportEmail}</a
            >.
        </p>
    </section>
</article>
