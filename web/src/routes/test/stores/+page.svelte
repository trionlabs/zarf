<script lang="ts">
  import { onMount } from "svelte";
  import { wizardStore } from "$lib/stores/wizardStore.svelte";
  import { claimFlowStore } from "$lib/stores/claimFlowStore.svelte";
  import { walletStore } from "$lib/stores/walletStore.svelte";
  import { themeStore } from "$lib/stores/themeStore.svelte";

  // Restore all stores on mount
  onMount(() => {
    wizardStore.restore();
    claimFlowStore.restore();
    themeStore.restore();
  });

  // Test functions - Updated to match new wizardStore API
  function testWizardTokenDetails() {
    wizardStore.setTokenDetails({
      tokenAddress:
        "0x1234567890123456789012345678901234567890" as `0x${string}`,
      tokenName: "Test Token",
      tokenSymbol: "TEST",
      tokenDecimals: 18,
      tokenTotalSupply: "1,000,000",
      iconUrl: null,
    });
  }

  function testWizardAddDistribution() {
    wizardStore.addDistribution({
      id: crypto.randomUUID(),
      name: "Series A Investors",
      description: "Test distribution for investors",
      amount: "100000",
      schedule: {
        cliffEndDate: "2025-06-01",
        distributionDurationMonths: 12,
      },
      recipients: [
        { email: "alice@example.com", amount: 1000 },
        { email: "bob@example.com", amount: 2000 },
        { email: "charlie@example.com", amount: 3000 },
      ],
      csvFilename: "test.csv",
      regulatoryRules: [],
    });
  }

  function testClaimFlow() {
    claimFlowStore.enterClaimFlow({
      id: "0xtest",
      name: "Test Distribution",
      projectIcon: "/test.png",
      status: "claimable",
      totalAmount: 10000,
      claimedAmount: 0,
      nextUnlockDate: "2025-01-01",
    });
  }

  function testWalletConnect() {
    walletStore.setConnecting(true);
    setTimeout(() => {
      walletStore.setConnected(
        "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        11155111, // Sepolia
      );
    }, 1000);
  }

  // Derived values for display
  const totalTokensInBasket = $derived(
    wizardStore.distributions.reduce((sum, d) => sum + Number(d.amount), 0),
  );
  const totalRecipients = $derived(
    wizardStore.distributions.reduce((sum, d) => sum + d.recipients.length, 0),
  );
  const hasValidToken = $derived(
    wizardStore.tokenDetails.tokenAddress !== null &&
      wizardStore.tokenDetails.tokenName !== null,
  );
</script>

<div class="container mx-auto p-8 space-y-8">
  <div class="flex justify-between items-center">
    <h1 class="text-4xl font-bold">🧪 Store Testing Page</h1>
    <button class="btn btn-primary" onclick={themeStore.toggleTheme}>
      Toggle Theme ({themeStore.current})
    </button>
  </div>

  <!-- Wizard Store -->
  <section class="card shadow-xl">
    <div class="card-body">
      <h2 class="card-title">📋 Wizard Store</h2>

      <div class="stats stats-vertical lg:stats-horizontal shadow">
        <div class="stat">
          <div class="stat-title">Current Step</div>
          <div class="stat-value">{wizardStore.currentStep} / 3</div>
        </div>

        <div class="stat">
          <div class="stat-title">Token</div>
          <div class="stat-value text-xl">
            {wizardStore.tokenDetails.tokenName || "None"}
          </div>
          <div class="stat-desc">
            {wizardStore.tokenDetails.tokenSymbol || "—"}
          </div>
        </div>

        <div class="stat">
          <div class="stat-title">Distributions</div>
          <div class="stat-value">{wizardStore.distributions.length}</div>
        </div>

        <div class="stat">
          <div class="stat-title">Total Recipients</div>
          <div class="stat-value">{totalRecipients}</div>
        </div>

        <div class="stat">
          <div class="stat-title">Total Tokens</div>
          <div class="stat-value text-xl">
            {totalTokensInBasket.toLocaleString()}
          </div>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 mt-4">
        <button class="btn btn-sm btn-primary" onclick={testWizardTokenDetails}>
          Set Token Details
        </button>
        <button
          class="btn btn-sm btn-primary"
          onclick={testWizardAddDistribution}
        >
          Add Distribution
        </button>
        <button class="btn btn-sm" onclick={wizardStore.nextStep}>
          Next Step
        </button>
        <button class="btn btn-sm" onclick={wizardStore.previousStep}>
          Previous Step
        </button>
        <button class="btn btn-sm btn-error" onclick={wizardStore.reset}>
          Reset
        </button>
      </div>

      <div class="alert" class:alert-success={hasValidToken}>
        <span>Token Valid: {hasValidToken ? "✅ Yes" : "❌ No"}</span>
      </div>
    </div>
  </section>

  <!-- Claim Flow Store -->
  <section class="card shadow-xl">
    <div class="card-body">
      <h2 class="card-title">💰 Claim Flow Store</h2>

      <div class="stats stats-vertical lg:stats-horizontal shadow">
        <div class="stat">
          <div class="stat-title">Mode</div>
          <div class="stat-value text-2xl">{claimFlowStore.mode}</div>
        </div>

        <div class="stat">
          <div class="stat-title">Current Step</div>
          <div class="stat-value">{claimFlowStore.currentStep} / 5</div>
          <div class="stat-desc">{claimFlowStore.currentStepName}</div>
        </div>

        <div class="stat">
          <div class="stat-title">In Claim Flow</div>
          <div class="stat-value text-2xl">
            {claimFlowStore.isInClaimFlow ? "✅" : "❌"}
          </div>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 mt-4">
        <button class="btn btn-sm btn-primary" onclick={testClaimFlow}>
          Enter Claim Flow
        </button>
        <button class="btn btn-sm" onclick={claimFlowStore.nextStep}>
          Next Step
        </button>
        <button class="btn btn-sm" onclick={claimFlowStore.previousStep}>
          Previous Step
        </button>
        <button
          class="btn btn-sm btn-error"
          onclick={claimFlowStore.exitClaimFlow}
        >
          Exit & Reset
        </button>
      </div>

      {#if claimFlowStore.selectedDistribution}
        <div class="alert alert-info">
          <span>Selected: {claimFlowStore.selectedDistribution.name}</span>
        </div>
      {/if}
    </div>
  </section>

  <!-- Wallet Store -->
  <section class="card shadow-xl">
    <div class="card-body">
      <h2 class="card-title">👛 Wallet Store</h2>

      <div class="stats stats-vertical lg:stats-horizontal shadow">
        <div class="stat">
          <div class="stat-title">Status</div>
          <div class="stat-value text-2xl">
            {#if walletStore.isConnecting}
              Connecting...
            {:else if walletStore.isConnected}
              Connected
            {:else}
              Disconnected
            {/if}
          </div>
        </div>

        <div class="stat">
          <div class="stat-title">Address</div>
          <div class="stat-value text-sm font-mono">
            {walletStore.shortAddress || "None"}
          </div>
        </div>

        <div class="stat">
          <div class="stat-title">Network</div>
          <div class="stat-value text-xl">{walletStore.networkName}</div>
          <div class="stat-desc">
            {walletStore.isWrongNetwork ? "⚠️ Wrong Network" : "✅ Correct"}
          </div>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 mt-4">
        <button class="btn btn-sm btn-primary" onclick={testWalletConnect}>
          Simulate Connect
        </button>
        <button
          class="btn btn-sm btn-error"
          onclick={walletStore.setDisconnected}
        >
          Disconnect
        </button>
      </div>

      {#if walletStore.address}
        <div class="alert alert-success">
          <span>Full Address: {walletStore.address}</span>
        </div>
      {/if}
    </div>
  </section>

  <!-- Theme Store -->
  <section class="card shadow-xl">
    <div class="card-body">
      <h2 class="card-title">🎨 Theme Store</h2>

      <div class="stats shadow">
        <div class="stat">
          <div class="stat-title">Current Theme</div>
          <div class="stat-value">{themeStore.current}</div>
          <div class="stat-desc">
            {themeStore.isDark ? "🌙 Dark Mode" : "☀️ Light Mode"}
          </div>
        </div>
      </div>

      <div class="flex gap-2 mt-4">
        <button class="btn btn-sm" onclick={() => themeStore.setTheme("nord")}>
          Set Nord
        </button>
        <button
          class="btn btn-sm"
          onclick={() => themeStore.setTheme("wireframe")}
        >
          Set Wireframe
        </button>
        <button class="btn btn-sm btn-primary" onclick={themeStore.toggleTheme}>
          Toggle
        </button>
      </div>
    </div>
  </section>

  <!-- Persistence Test -->
  <section class="card shadow-xl">
    <div class="card-body">
      <h2 class="card-title">💾 Persistence Test</h2>
      <p>
        Make some changes above, then reload the page. The wizard and claim flow
        states should restore from localStorage/sessionStorage.
      </p>
      <button class="btn btn-warning" onclick={() => window.location.reload()}>
        Reload Page
      </button>
    </div>
  </section>
</div>
