<script>
  import { onMount } from 'svelte';
  import {
    initiateGoogleLogin,
    extractTokenFromUrl,
    decodeJwt,
    fetchGooglePublicKeys,
    findKeyById,
    clearUrlFragment,
  } from './lib/googleAuth.js';
  import { generateJwtProof, isProofGenerationSupported } from './lib/jwtProver.js';

  // State
  let jwt = $state(null);
  let jwtPayload = $state(null);
  let publicKey = $state(null);
  let proof = $state(null);
  let status = $state('');
  let isGenerating = $state(false);
  let error = $state(null);

  // Config - Replace with your Google OAuth Client ID
  const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const REDIRECT_URI = window.location.origin + window.location.pathname;

  onMount(async () => {
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
          error = 'Could not find matching public key for JWT';
        }

        // Clear token from URL for security
        clearUrlFragment();
        status = 'JWT loaded successfully';
      } catch (e) {
        error = `Failed to process JWT: ${e.message}`;
      }
    }
  });

  function handleLogin() {
    if (!CLIENT_ID) {
      error = 'Please set VITE_GOOGLE_CLIENT_ID in your .env file';
      return;
    }
    initiateGoogleLogin(CLIENT_ID, REDIRECT_URI);
  }

  async function handleGenerateProof() {
    if (!jwt || !publicKey || !jwtPayload?.email) {
      error = 'Missing JWT, public key, or email claim';
      return;
    }

    if (!isProofGenerationSupported()) {
      error = 'Your browser does not support WebAssembly or BigInt';
      return;
    }

    isGenerating = true;
    error = null;
    proof = null;

    try {
      const result = await generateJwtProof(jwt, publicKey, jwtPayload.email, (msg) => {
        status = msg;
      });
      proof = result;
      status = 'Proof generated successfully!';
    } catch (e) {
      error = `Proof generation failed: ${e.message}`;
      status = '';
    } finally {
      isGenerating = false;
    }
  }

  function handleReset() {
    jwt = null;
    jwtPayload = null;
    publicKey = null;
    proof = null;
    status = '';
    error = null;
  }
</script>

<main>
  <div class="container">
    <h1>Zarf</h1>
    <p class="subtitle">Zarf</p>

    {#if error}
      <div class="error">{error}</div>
    {/if}

    {#if !jwt}
      <!-- Login State -->
      <div class="card">
        <h2>Login with Google</h2>
        <p>Authenticate with Google to get a JWT containing your email claim.</p>
        <button onclick={handleLogin} class="primary">Login with Google</button>

        {#if !CLIENT_ID}
          <p class="warning">
            Set <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env</code> file to enable login.
          </p>
        {/if}
      </div>
    {:else if !proof}
      <!-- JWT Loaded State -->
      <div class="card">
        <h2>JWT Claims</h2>
        <div class="claims">
          <div class="claim">
            <span class="label">Email:</span>
            <span class="value">{jwtPayload?.email || 'N/A'}</span>
          </div>
          <div class="claim">
            <span class="label">Name:</span>
            <span class="value">{jwtPayload?.name || 'N/A'}</span>
          </div>
          <div class="claim">
            <span class="label">Issuer:</span>
            <span class="value">{jwtPayload?.iss || 'N/A'}</span>
          </div>
          <div class="claim">
            <span class="label">Expires:</span>
            <span class="value"
              >{jwtPayload?.exp ? new Date(jwtPayload.exp * 1000).toLocaleString() : 'N/A'}</span
            >
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Generate a ZK Proof</h2>
        <p>
          Generate a zero-knowledge proof that you own a valid Google JWT with this email, without
          revealing the JWT itself.
        </p>
        <button onclick={handleGenerateProof} class="primary" disabled={isGenerating}>
          {isGenerating ? 'Generating...' : 'Generate Proof'}
        </button>
        {#if status}
          <p class="status">{status}</p>
        {/if}
      </div>
    {:else}
      <!-- Proof Generated State -->
      <div class="card success">
        <h2>Proof Generated!</h2>
        <div class="proof-info">
          <div class="claim">
            <span class="label">Email Proven:</span>
            <span class="value">{jwtPayload?.email}</span>
          </div>
          <div class="claim">
            <span class="label">Proof Length:</span>
            <span class="value">{proof.proof.length} chars</span>
          </div>
        </div>
        <details>
          <summary>View Proof (hex)</summary>
          <pre class="proof-hex">{proof.proof}</pre>
        </details>
        <details>
          <summary>View Public Inputs</summary>
          <pre class="proof-hex">{JSON.stringify(proof.publicInputs, null, 2)}</pre>
        </details>
      </div>

      <button onclick={handleReset} class="secondary">Start Over</button>
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

  button.secondary:hover {
    background: #444;
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
    min-width: 80px;
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
  }

  .warning {
    color: #fbbf24;
    font-size: 0.875rem;
    margin-top: 1rem;
  }

  .warning code {
    background: #333;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
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
</style>
