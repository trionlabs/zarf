/**
 * Wallet connection utilities using wagmi/core
 */

import { createConfig, http, connect, disconnect, getAccount, watchAccount } from '@wagmi/core';
import { injected } from '@wagmi/connectors';
import { mainnet, sepolia } from 'viem/chains';

// Create wagmi config
const config = createConfig({
  chains: [mainnet, sepolia],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

/**
 * Connect wallet using injected connector (MetaMask, etc.)
 * @returns {Promise<{ address: string, chainId: number }>}
 */
export async function connectWallet() {
  const result = await connect(config, {
    connector: injected(),
  });

  return {
    address: result.accounts[0],
    chainId: result.chainId,
  };
}

/**
 * Disconnect wallet
 */
export async function disconnectWallet() {
  await disconnect(config);
}

/**
 * Get current account info
 * @returns {{ address: string | undefined, isConnected: boolean }}
 */
export function getWalletAccount() {
  const account = getAccount(config);
  return {
    address: account.address,
    isConnected: account.isConnected,
  };
}

/**
 * Watch for account changes
 * @param {function} callback - Called with { address, isConnected } on change
 * @returns {function} Unsubscribe function
 */
export function watchWalletAccount(callback) {
  return watchAccount(config, {
    onChange: (account) => {
      callback({
        address: account.address,
        isConnected: account.isConnected,
      });
    },
  });
}

/**
 * Format address for display
 * @param {string} address - Full address
 * @returns {string} Shortened address (0x1234...5678)
 */
export function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
