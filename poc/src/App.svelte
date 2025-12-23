<script>
  import { onMount } from "svelte";
  import {
    initiateGoogleLogin,
    extractTokenFromUrl,
    decodeJwt,
    fetchGooglePublicKeys,
    findKeyById,
    clearUrlFragment,
  } from "./lib/googleAuth.js";
  import {
    generateJwtProof,
    isProofGenerationSupported,
  } from "./lib/jwtProver.js";
  import { readCSVFile, generateSampleCSV } from "./lib/csvProcessor.js";
  import { processWhitelist, getMerkleProof } from "./lib/merkleTree.js";
  import {
    connectWallet,
    disconnectWallet,
    getWalletAccount,
    watchWalletAccount,
    formatAddress,
  } from "./lib/wallet.js";
  import {
    submitClaim,
    isContractConfigured,
    getExplorerUrl,
    getVestingInfo,
  } from "./lib/contracts.js";

  // State
  let jwt = $state(null);
  let jwtPayload = $state(null);
  let publicKey = $state(null);
  let proof = $state(null);
  let status = $state("");
  let isGenerating = $state(false);
  let error = $state(null);

  // Wallet state
  let walletAddress = $state(null);
  let isConnectingWallet = $state(false);

  // Claim submission state
  let isSubmitting = $state(false);
  let txHash = $state(null);
  let claimSuccess = $state(false);
  let contractConfigured = $state(false);
  let vestingInfo = $state(null);

  // Whitelist state
  let whitelist = $state(null); // { root, tree, claims }
  let userClaim = $state(null); // claim data for logged-in user
  let isProcessingCSV = $state(false);
  let loadedFilename = $state(null);

  // File input reference for resetting
  let fileInputRef = $state(null);

  // Config
  const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
  const REDIRECT_URI = window.location.origin + window.location.pathname;
  const STORAGE_KEY = "zarf_whitelist";

  // Persist whitelist to localStorage
  function saveWhitelist(data) {
    try {
      // Convert bigints to strings for JSON serialization
      const serializable = {
        root: data.root.toString(),
        claims: data.claims.map((c) => ({
          ...c,
          salt: c.salt.toString(),
          leaf: c.leaf.toString(),
        })),
        filename: loadedFilename,
        tree: {
          minDepth: data.tree.minDepth,
          depth: data.tree.depth,
          // Store layers as string arrays
          layers: data.tree.layers.map((layer) =>
            layer.map((v) => v.toString()),
          ),
          emptyHashes: data.tree.emptyHashes.map((v) => v.toString()),
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (e) {
      console.warn("Failed to save whitelist:", e);
    }
  }

  // Restore whitelist from localStorage
  function loadWhitelist() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;

      const data = JSON.parse(stored);
      return {
        root: BigInt(data.root),
        claims: data.claims.map((c) => ({
          ...c,
          salt: c.salt,
          leaf: BigInt(c.leaf),
        })),
        filename: data.filename || "Unknown",
        tree: {
          minDepth: data.tree.minDepth,
          depth: data.tree.depth,
          layers: data.tree.layers.map((layer) => layer.map((v) => BigInt(v))),
          emptyHashes: data.tree.emptyHashes.map((v) => BigInt(v)),
        },
      };
    } catch (e) {
      console.warn("Failed to load whitelist:", e);
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  onMount(async () => {
    // Check if contracts are configured
    contractConfigured = isContractConfigured();
    if (contractConfigured) {
      vestingInfo = await getVestingInfo();
    }

    // Restore whitelist from localStorage (survives OAuth redirect)
    const savedWhitelist = loadWhitelist();
    if (savedWhitelist) {
      whitelist = savedWhitelist;
      loadedFilename = savedWhitelist.filename;
    }

    // Check for existing wallet connection
    const account = getWalletAccount();
    if (account.isConnected) {
      walletAddress = account.address;
    }

    // Watch for wallet changes
    watchWalletAccount((account) => {
      walletAddress = account.isConnected ? account.address : null;
    });

    // Check for token in URL after OAuth redirect
    const token = extractTokenFromUrl();
    if (token) {
      try {
        jwt = token;
        const decoded = decodeJwt(token);
        jwtPayload = decoded.payload;

        // Fetch Google's public keys and find the matching one
        const keys = await fetchGooglePublicKeys();
        publicKey = findKeyById(keys, decoded.header.kid);

        if (!publicKey) {
          error = "Could not find matching public key for JWT";
        }

        // Check if user is in whitelist
        if (whitelist && jwtPayload?.email) {
          checkUserInWhitelist(jwtPayload.email);
        }

        clearUrlFragment();
        status = "JWT loaded successfully";
      } catch (e) {
        error = `Failed to process JWT: ${e.message}`;
      }
    }
  });

  function checkUserInWhitelist(email) {
    if (!whitelist) return;

    const normalizedEmail = email.toLowerCase().trim();
    const claim = whitelist.claims.find((c) => c.email === normalizedEmail);

    if (claim) {
      const merkleProof = getMerkleProof(whitelist.tree, claim.leafIndex);
      userClaim = {
        ...claim,
        merkleProof,
        merkleRoot: whitelist.root,
      };
    } else {
      userClaim = null;
    }
  }

  async function handleCSVUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    isProcessingCSV = true;
    error = null;

    try {
      status = "Reading CSV file...";
      const entries = await readCSVFile(file);

      if (entries.length === 0) {
        throw new Error("No valid entries found in CSV");
      }

      status = `Processing ${entries.length} entries...`;
      whitelist = await processWhitelist(entries);
      loadedFilename = file.name;

      // Save to localStorage to survive OAuth redirect
      saveWhitelist(whitelist);

      status = `Whitelist created with ${entries.length} entries. Merkle root: ${whitelist.root.toString(16).slice(0, 16)}...`;

      // Check if current user is in whitelist
      if (jwtPayload?.email) {
        checkUserInWhitelist(jwtPayload.email);
      }
    } catch (e) {
      error = `Failed to process CSV: ${e.message}`;
      status = "";
    } finally {
      isProcessingCSV = false;
      // Reset file input so same file can be selected again
      if (fileInputRef) {
        fileInputRef.value = "";
      }
    }
  }

  function handleUseSampleCSV() {
    const sampleContent = generateSampleCSV();
    const blob = new Blob([sampleContent], { type: "text/csv" });
    const file = new File([blob], "sample.csv", { type: "text/csv" });

    // Trigger the same processing as file upload
    handleCSVUpload({ target: { files: [file] } });
    loadedFilename = "Internal Sample";
  }

  function handleLogin() {
    if (!CLIENT_ID) {
      error = "Please set VITE_GOOGLE_CLIENT_ID in your .env file";
      return;
    }
    initiateGoogleLogin(CLIENT_ID, REDIRECT_URI);
  }

  async function handleConnectWallet() {
    isConnectingWallet = true;
    error = null;

    try {
      const result = await connectWallet();
      walletAddress = result.address;
      status = `Wallet connected: ${formatAddress(result.address)}`;
    } catch (e) {
      error = `Failed to connect wallet: ${e.message}`;
    } finally {
      isConnectingWallet = false;
    }
  }

  async function handleDisconnectWallet() {
    try {
      await disconnectWallet();
      walletAddress = null;
      status = "";
    } catch (e) {
      error = `Failed to disconnect wallet: ${e.message}`;
    }
  }

  async function handleGenerateProof() {
    // Relaxed validation - let it try and fail with circuit error if invalid
    if (!isProofGenerationSupported()) {
      error = "Your browser does not support WebAssembly or BigInt";
      return;
    }

    isGenerating = true;
    error = null;
    proof = null;

    try {
      const claimData = {
        email: jwtPayload?.email || "",
        salt: userClaim?.salt || "0x0",
        amount: userClaim?.amount || 0,
        merkleProof: userClaim?.merkleProof || { siblings: [], indices: [] },
        merkleRoot: userClaim?.merkleRoot || 0n,
        recipient: walletAddress || "0x0", // Bind proof to wallet address
      };

      const result = await generateJwtProof(
        jwt,
        publicKey,
        claimData,
        (msg) => {
          status = msg;
        },
      );

      proof = {
        ...result,
        amount: userClaim?.amount || 0,
      };
      status = "Proof generated successfully!";
    } catch (e) {
      error = `Proof generation failed: ${e.message}`;
      status = "";
    } finally {
      isGenerating = false;
    }
  }

  async function handleSubmitClaim() {
    if (!proof || !walletAddress) return;

    isSubmitting = true;
    error = null;
    status = "Submitting claim transaction...";

    try {
      const result = await submitClaim(
        proof.proof,
        proof.publicInputs,
        walletAddress,
      );

      txHash = result.hash;
      claimSuccess = true;
      status = "Claim successful!";
    } catch (e) {
      error = `Claim failed: ${e.message}`;
      status = "";
    } finally {
      isSubmitting = false;
    }
  }

  function handleReset() {
    jwt = null;
    jwtPayload = null;
    publicKey = null;
    proof = null;
    userClaim = null;
    status = "";
    error = null;
    txHash = null;
    claimSuccess = false;
  }

  function handleResetAll() {
    handleReset();
    whitelist = null;
    loadedFilename = null;
    localStorage.removeItem(STORAGE_KEY);
  }
</script>

<main>
  <div class="container">
    <h1>Zarf</h1>
    <p class="subtitle">Private Email Whitelist Verification</p>

    {#if error}
      <div class="error">
        <span>{error}</span>
        <button
          class="dismiss-btn"
          onclick={() => (error = null)}
          aria-label="Dismiss error">×</button
        >
      </div>
    {/if}

    {#if !whitelist}
      <!-- Step 1: Upload CSV -->
      <div class="card">
        <h2>1. Upload Whitelist CSV</h2>
        <p>
          Upload a CSV file with email addresses and amounts. Format: <code
            >email,amount</code
          >
        </p>

        <div class="upload-area">
          <input
            type="file"
            accept=".csv"
            onchange={handleCSVUpload}
            disabled={isProcessingCSV}
            id="csv-upload"
            bind:this={fileInputRef}
          />
          <label for="csv-upload" class="upload-label">
            {isProcessingCSV ? "Processing..." : "Choose CSV File"}
          </label>
        </div>

        <button
          onclick={handleUseSampleCSV}
          class="secondary"
          disabled={isProcessingCSV}
        >
          Use Sample CSV
        </button>

        {#if status}
          <p class="status">{status}</p>
        {/if}
      </div>
    {:else if !jwt}
      <!-- Step 2: Login with Google -->
      <div class="card success">
        <h2>Whitelist Loaded</h2>
        <div class="claims">
          <div class="claim">
            <span class="label">Source:</span>
            <span class="value">{loadedFilename}</span>
          </div>
          <div class="claim">
            <span class="label">Entries:</span>
            <span class="value">{whitelist.claims.length}</span>
          </div>
          <div class="claim">
            <span class="label">Merkle Root:</span>
            <span class="value hash"
              >{whitelist.root.toString(16).slice(0, 20)}...</span
            >
          </div>
        </div>
      </div>

      <div class="card">
        <h2>2. Login with Google</h2>
        <p>
          Authenticate with Google to prove you own an email in the whitelist.
        </p>
        <button onclick={handleLogin} class="primary">Login with Google</button>

        {#if !CLIENT_ID}
          <p class="warning">
            Set <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env</code> file to enable
            login.
          </p>
        {/if}
      </div>

      <button onclick={handleResetAll} class="secondary">Start Over</button>
    {:else if !proof}
      <!-- JWT Claims Card -->
      <div class="card">
        <h2>JWT Claims</h2>
        <div class="claims">
          <div class="claim">
            <span class="label">Email:</span>
            <span class="value">{jwtPayload?.email || "N/A"}</span>
          </div>
          <div class="claim">
            <span class="label">Name:</span>
            <span class="value">{jwtPayload?.name || "N/A"}</span>
          </div>
        </div>
      </div>

      {#if userClaim}
        <div class="card success">
          <h2>Email Found in Whitelist</h2>
          <div class="claims">
            <div class="claim">
              <span class="label">Amount:</span>
              <span class="value">{userClaim.amount}</span>
            </div>
            <div class="claim">
              <span class="label">Leaf Index:</span>
              <span class="value">{userClaim.leafIndex}</span>
            </div>
          </div>
        </div>
      {:else}
        <div class="card error-card">
          <h2>Email Not in Whitelist</h2>
          <p>
            Your email ({jwtPayload?.email}) is not in the uploaded whitelist.
          </p>
        </div>
      {/if}

      <!-- Step 3: Connect Wallet -->
      <div class="card">
        <h2>3. Connect Wallet</h2>
        <p>
          Connect your wallet to bind the proof to your address (prevents
          front-running).
        </p>

        {#if walletAddress}
          <div class="wallet-connected">
            <span class="wallet-address">{formatAddress(walletAddress)}</span>
            <button onclick={handleDisconnectWallet} class="secondary small"
              >Disconnect</button
            >
          </div>
        {:else}
          <button
            onclick={handleConnectWallet}
            class="primary"
            disabled={isConnectingWallet}
          >
            {isConnectingWallet ? "Connecting..." : "Connect Wallet"}
          </button>
        {/if}
      </div>

      <!-- Step 4: Generate Proof -->
      <div class="card">
        <h2>4. Generate ZK Proof</h2>
        <p>
          {#if userClaim}
            Generate a zero-knowledge proof that your email is in the whitelist,
            without revealing which email you own.
          {:else}
            <span class="warning-text"
              >Warning: Your email is not in the whitelist. Proof generation
              will fail at the circuit level.</span
            >
          {/if}
        </p>
        {#if !walletAddress}
          <p class="warning-text">Please connect your wallet first.</p>
        {/if}
        <button
          onclick={handleGenerateProof}
          class="primary"
          disabled={isGenerating || !walletAddress}
        >
          {isGenerating ? "Generating..." : "Generate Proof"}
        </button>
        {#if status}
          <p class="status">{status}</p>
        {/if}
      </div>

      <button onclick={handleReset} class="secondary"
        >Try Different Account</button
      >
    {:else}
      <!-- Proof Generated State -->
      <div class="card success">
        <h2>{claimSuccess ? "Claim Successful!" : "Proof Generated!"}</h2>
        <p class="privacy-note">
          Your email is private. Only the hash commitment and Merkle root are
          public.
        </p>
        <div class="proof-info">
          <div class="claim">
            <span class="label">Email Hash:</span>
            <span class="value hash">{proof.emailHash}</span>
          </div>
          <div class="claim">
            <span class="label">Merkle Root:</span>
            <span class="value hash">{proof.merkleRoot}</span>
          </div>
          <div class="claim">
            <span class="label">Recipient:</span>
            <span class="value hash">{proof.recipient}</span>
          </div>
          <div class="claim">
            <span class="label">Amount:</span>
            <span class="value">{proof.amount}</span>
          </div>
          <div class="claim">
            <span class="label">Proof Size:</span>
            <span class="value">{proof.proof.length} chars</span>
          </div>
          {#if txHash}
            <div class="claim">
              <span class="label">Transaction:</span>
              <span class="value">
                <a
                  href={getExplorerUrl(txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="tx-link"
                >
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </a>
              </span>
            </div>
          {/if}
        </div>
        <details>
          <summary>View Proof (hex)</summary>
          <pre class="proof-hex">{proof.proof}</pre>
        </details>
        <details>
          <summary>View Public Inputs</summary>
          <pre class="proof-hex">{JSON.stringify(
              proof.publicInputs,
              null,
              2,
            )}</pre>
        </details>
      </div>

      <!-- Step 5: Submit Claim -->
      {#if !claimSuccess}
        <div class="card">
          <h2>5. Submit Claim</h2>
          {#if contractConfigured}
            <p>Submit your ZK proof on-chain to claim your tokens.</p>
            {#if vestingInfo}
              <div class="vesting-info">
                <small
                  >Contract: {vestingInfo.vestingAddress.slice(0, 10)}...</small
                >
              </div>
            {/if}
            <button
              onclick={handleSubmitClaim}
              class="primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit Claim"}
            </button>
            {#if status}
              <p class="status">{status}</p>
            {/if}
          {:else}
            <p class="warning-text">
              Contract not configured. Set <code>VITE_VESTING_ADDRESS</code> in
              your <code>.env</code> file.
            </p>
            <p>For now, copy the proof above and submit manually.</p>
          {/if}
        </div>
      {:else}
        <div class="card success">
          <h2>Tokens Claimed!</h2>
          <p>Your tokens have been successfully claimed to your wallet.</p>
        </div>
      {/if}

      <button onclick={handleResetAll} class="secondary">Start Over</button>
    {/if}
  </div>
</main>

<style>
  main {
    padding: 2rem;
    max-width: 600px;
    margin: 0 auto;
  }

  .container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  h1 {
    font-size: 2.5rem;
    font-weight: 700;
    text-align: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    text-align: center;
    color: #888;
    margin-top: -0.5rem;
  }

  .card {
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 1.5rem;
  }

  .card.success {
    border-color: #22c55e;
  }

  .card.error-card {
    border-color: #dc2626;
  }

  .card h2 {
    font-size: 1.25rem;
    margin-bottom: 0.75rem;
    color: #fff;
  }

  .card p {
    color: #aaa;
    margin-bottom: 1rem;
    line-height: 1.5;
  }

  .card code {
    background: #333;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.875rem;
  }

  button {
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    border: none;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  button.primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  button.primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  button.primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  button.secondary {
    background: #333;
    color: #fff;
  }

  button.secondary:hover:not(:disabled) {
    background: #444;
  }

  button.small {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
  }

  .wallet-connected {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: #0a0a0a;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    border: 1px solid #22c55e;
  }

  .wallet-address {
    font-family: monospace;
    color: #22c55e;
    font-size: 0.875rem;
  }

  .upload-area {
    margin-bottom: 1rem;
  }

  .upload-area input[type="file"] {
    display: none;
  }

  .upload-label {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }

  .upload-label:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .claims {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .claim {
    display: flex;
    gap: 0.5rem;
  }

  .claim .label {
    color: #888;
    min-width: 100px;
  }

  .claim .value {
    color: #fff;
    word-break: break-all;
  }

  .error {
    background: #7f1d1d;
    border: 1px solid #dc2626;
    color: #fca5a5;
    padding: 1rem;
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .dismiss-btn {
    background: none;
    border: none;
    color: #fca5a5;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    opacity: 0.7;
  }

  .dismiss-btn:hover {
    opacity: 1;
  }

  .warning {
    color: #fbbf24;
    font-size: 0.875rem;
    margin-top: 1rem;
  }

  .warning-text {
    color: #fbbf24;
  }

  .status {
    color: #667eea;
    font-size: 0.875rem;
    margin-top: 0.75rem;
  }

  details {
    margin-top: 1rem;
  }

  summary {
    cursor: pointer;
    color: #888;
    font-size: 0.875rem;
  }

  .proof-hex {
    background: #0a0a0a;
    padding: 1rem;
    border-radius: 8px;
    font-size: 0.75rem;
    word-break: break-all;
    max-height: 200px;
    overflow-y: auto;
    margin-top: 0.5rem;
  }

  .proof-info {
    margin-bottom: 1rem;
  }

  .privacy-note {
    color: #22c55e !important;
    font-size: 0.875rem;
    margin-bottom: 1rem !important;
  }

  .value.hash {
    font-family: monospace;
    font-size: 0.75rem;
    background: #0a0a0a;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  .tx-link {
    color: #667eea;
    text-decoration: none;
    font-family: monospace;
    font-size: 0.75rem;
  }

  .tx-link:hover {
    text-decoration: underline;
  }

  .vesting-info {
    margin-bottom: 1rem;
    color: #888;
  }

  .vesting-info small {
    font-family: monospace;
  }
</style>
