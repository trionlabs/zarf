/**
 * Contract interaction for ZarfVesting claims
 */

import { createPublicClient, createWalletClient, custom, http, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';

// Contract addresses - set via environment variables
const VESTING_ADDRESS = import.meta.env.VITE_VESTING_ADDRESS;
const JWK_REGISTRY_ADDRESS = import.meta.env.VITE_JWK_REGISTRY_ADDRESS;

// Minimal ABIs for the functions we need
const VESTING_ABI = parseAbi([
  'function claim(bytes calldata proof, bytes32[] calldata publicInputs) external',
  'function calculateVested(bytes32 emailHash) external view returns (uint256)',
  'function getClaimable(bytes32 emailHash) external view returns (uint256)',
  'function claimed(bytes32 emailHash) external view returns (uint256)',
  'function allocations(bytes32 emailHash) external view returns (uint256)',
  'function vestingStart() external view returns (uint256)',
  'function cliffDuration() external view returns (uint256)',
  'function vestingDuration() external view returns (uint256)',
  'function merkleRoot() external view returns (bytes32)',
  'error InvalidProof()',
  'error InvalidMerkleRoot()',
  'error InvalidRecipient()',
  'error InvalidPubkey()',
  'error NothingToClaim()',
  'error VestingNotStarted()',
]);

const JWK_REGISTRY_ABI = parseAbi([
  'function isValidKeyHash(bytes32 keyHash) external view returns (bool)',
  'function computeKeyHash(bytes32[18] calldata pubkeyLimbs) external pure returns (bytes32)',
]);

// Chain configuration
const chain = sepolia;

/**
 * Ensure wallet is connected to Sepolia
 * Switches chain if necessary
 */
async function ensureSepoliaChain() {
  if (!window.ethereum) {
    throw new Error('No wallet found. Please install MetaMask or similar.');
  }

  const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
  const sepoliaChainId = '0x' + sepolia.id.toString(16); // 0xaa36a7

  if (currentChainId !== sepoliaChainId) {
    try {
      // Try to switch to Sepolia
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: sepoliaChainId }],
      });
    } catch (switchError) {
      // Chain not added to wallet, add it
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: sepoliaChainId,
              chainName: 'Sepolia',
              nativeCurrency: {
                name: 'Sepolia ETH',
                symbol: 'ETH',
                decimals: 18,
              },
              rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
              blockExplorerUrls: ['https://sepolia.etherscan.io'],
            },
          ],
        });
      } else {
        throw new Error(`Failed to switch to Sepolia: ${switchError.message}`);
      }
    }
  }
}

/**
 * Get public client for reading contract state
 */
function getPublicClient() {
  const rpcUrl = import.meta.env.VITE_RPC_URL || chain.rpcUrls.default.http[0];
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

/**
 * Get wallet client for sending transactions
 */
function getWalletClient() {
  if (!window.ethereum) {
    throw new Error('No wallet found. Please install MetaMask or similar.');
  }
  return createWalletClient({
    chain,
    transport: custom(window.ethereum),
  });
}

/**
 * Submit a claim transaction
 * @param {string} proof - Hex-encoded proof bytes
 * @param {string[]} publicInputs - Array of 21 bytes32 hex values
 * @param {string} account - User's wallet address
 * @returns {Promise<{hash: string, receipt: object}>}
 */
export async function submitClaim(proof, publicInputs, account) {
  if (!VESTING_ADDRESS) {
    throw new Error('VITE_VESTING_ADDRESS not configured');
  }

  // Ensure wallet is on Sepolia before proceeding
  await ensureSepoliaChain();

  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  // Convert proof to bytes
  const proofBytes = proof.startsWith('0x') ? proof : `0x${proof}`;

  // Ensure publicInputs are properly formatted as bytes32
  const formattedInputs = publicInputs.map((input) => {
    if (typeof input === 'string' && input.startsWith('0x')) {
      return input.padEnd(66, '0'); // Ensure 32 bytes (64 hex chars + 0x)
    }
    // Convert bigint/number to hex
    return '0x' + BigInt(input).toString(16).padStart(64, '0');
  });

  console.log('Submitting claim with:', {
    proof: proofBytes.slice(0, 20) + '...',
    publicInputsCount: formattedInputs.length,
    account,
  });

  // Simulate first to catch errors
  try {
    await publicClient.simulateContract({
      address: VESTING_ADDRESS,
      abi: VESTING_ABI,
      functionName: 'claim',
      args: [proofBytes, formattedInputs],
      account,
    });
  } catch (error) {
    // Parse contract errors
    if (error.message.includes('InvalidProof')) {
      throw new Error('ZK proof verification failed on-chain');
    }
    if (error.message.includes('InvalidPubkey')) {
      throw new Error('JWT public key not registered in JWKRegistry');
    }
    if (error.message.includes('InvalidMerkleRoot')) {
      throw new Error('Merkle root in proof does not match contract');
    }
    if (error.message.includes('InvalidRecipient')) {
      throw new Error('Proof was generated for a different wallet address');
    }
    if (error.message.includes('NothingToClaim')) {
      throw new Error('No tokens available to claim (already claimed or not vested)');
    }
    if (error.message.includes('VestingNotStarted')) {
      throw new Error('Vesting has not started yet');
    }
    throw error;
  }

  // Send transaction
  const hash = await walletClient.writeContract({
    address: VESTING_ADDRESS,
    abi: VESTING_ABI,
    functionName: 'claim',
    args: [proofBytes, formattedInputs],
    account,
    chain,
  });

  console.log('Transaction submitted:', hash);

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('Transaction confirmed:', receipt);

  return { hash, receipt };
}

/**
 * Get vesting info from contract
 */
export async function getVestingInfo() {
  if (!VESTING_ADDRESS) {
    return null;
  }

  const publicClient = getPublicClient();

  try {
    const [vestingStart, cliffDuration, vestingDuration, merkleRoot] = await Promise.all([
      publicClient.readContract({
        address: VESTING_ADDRESS,
        abi: VESTING_ABI,
        functionName: 'vestingStart',
      }),
      publicClient.readContract({
        address: VESTING_ADDRESS,
        abi: VESTING_ABI,
        functionName: 'cliffDuration',
      }),
      publicClient.readContract({
        address: VESTING_ADDRESS,
        abi: VESTING_ABI,
        functionName: 'vestingDuration',
      }),
      publicClient.readContract({
        address: VESTING_ADDRESS,
        abi: VESTING_ABI,
        functionName: 'merkleRoot',
      }),
    ]);

    return {
      vestingStart: Number(vestingStart),
      cliffDuration: Number(cliffDuration),
      vestingDuration: Number(vestingDuration),
      merkleRoot,
      vestingAddress: VESTING_ADDRESS,
    };
  } catch (error) {
    console.warn('Failed to fetch vesting info:', error);
    return null;
  }
}

/**
 * Get claim status for an email hash
 */
export async function getClaimStatus(emailHash) {
  if (!VESTING_ADDRESS) {
    return null;
  }

  const publicClient = getPublicClient();

  try {
    const [allocation, claimed, vested, claimable] = await Promise.all([
      publicClient.readContract({
        address: VESTING_ADDRESS,
        abi: VESTING_ABI,
        functionName: 'allocations',
        args: [emailHash],
      }),
      publicClient.readContract({
        address: VESTING_ADDRESS,
        abi: VESTING_ABI,
        functionName: 'claimed',
        args: [emailHash],
      }),
      publicClient.readContract({
        address: VESTING_ADDRESS,
        abi: VESTING_ABI,
        functionName: 'calculateVested',
        args: [emailHash],
      }),
      publicClient.readContract({
        address: VESTING_ADDRESS,
        abi: VESTING_ABI,
        functionName: 'getClaimable',
        args: [emailHash],
      }),
    ]);

    return {
      allocation: allocation.toString(),
      claimed: claimed.toString(),
      vested: vested.toString(),
      claimable: claimable.toString(),
    };
  } catch (error) {
    console.warn('Failed to fetch claim status:', error);
    return null;
  }
}

/**
 * Check if contracts are configured
 */
export function isContractConfigured() {
  return !!VESTING_ADDRESS;
}

/**
 * Get explorer URL for transaction
 */
export function getExplorerUrl(txHash) {
  return `${chain.blockExplorers.default.url}/tx/${txHash}`;
}
