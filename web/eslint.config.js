import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default ts.config(
    includeIgnoreFile(gitignorePath),
    js.configs.recommended,
    ...ts.configs.recommended,
    ...svelte.configs['flat/recommended'],
    prettier,
    ...svelte.configs['flat/prettier'],
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            // Console hygiene — mirrors web/scripts/check-console-allow-list.mjs.
            // `warn`/`error` permitted because production esbuild only strips
            // `log`/`info`/`debug`; the others are real signal.
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            // Explicit `any` is the drift gate from check-any-allow-list.mjs.
            // Per-file overrides below mirror that script's WHOLE_FILE list.
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
        },
    },
    {
        files: ['**/*.svelte', '**/*.svelte.ts'],
        languageOptions: {
            parserOptions: {
                parser: ts.parser,
            },
        },
    },
    {
        // Boundary code where `any` is load-bearing (postMessage payloads,
        // DOM-intrinsic shims, JSON parse outputs, build config, Buffer
        // polyfill attachment). Same allow-list scope as
        // scripts/check-any-allow-list.mjs.
        files: [
            'packages/core/lib/zk/proof.worker.ts',
            'packages/core/lib/zk/index.ts',
            'packages/core/lib/utils/domPreserve.ts',
            'packages/core/lib/utils/json.ts',
            'packages/core/lib/crypto/merkleTree.ts',
            'packages/ui/lib/components/ui/ZenInput.svelte',
            'packages/ui/lib/stores/walletStore.svelte.ts',
            'apps/*/src/hooks.client.ts',
            'apps/create/src/lib/components/distributions/DistributionEmptyState.svelte',
            '**/vite.config.ts',
            '**/svelte.config.js',
            'scripts/**',
        ],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
    {
        // Sanitization regex intentionally targets ASCII control chars
        // (NULL through US, ESC). The rule exists to catch typo'd
        // escapes; these files use it deliberately.
        files: ['apps/indexer/src/index.ts', 'packages/core/lib/services/distributionDiscovery.ts'],
        rules: {
            'no-control-regex': 'off',
        },
    },
    {
        // Console-allow scope — mirrors check-console-allow-list.mjs's
        // WHOLE_FILE entries (helper impl, Web Worker, ZK bridge, SES
        // bootstrap, backend CF workers, build/CLI scripts, vite configs
        // referencing 'console.*' as esbuild.pure string literals).
        // ESLint per-file disable avoids inline /* eslint-disable */
        // pragmas; the grep drift gate still pins the call surface so
        // a new direct console.* outside the allow-list breaks CI.
        //
        // Script bodies also legitimately carry intermediate vars that
        // don't warrant the same hygiene as app code — `no-unused-vars`
        // disabled for that scope only.
        files: [
            'packages/core/lib/utils/log.ts',
            'packages/core/lib/utils/domPreserve.ts',
            'packages/core/lib/zk/index.ts',
            'packages/core/lib/zk/proof.worker.ts',
            'packages/core/scripts/**',
            'apps/claim/src/hooks.client.ts',
            'apps/create/src/hooks.client.ts',
            'apps/indexer/src/**',
            'apps/jwk-rotation/src/**',
            'apps/*/vite.config.ts',
            'scripts/**',
        ],
        rules: {
            'no-console': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
        },
    },
    {
        // Migration-scope rules: real signal worth tracking but too many
        // existing sites to fail CI on today. Downgraded from `error` to
        // `warn` for the baseline; ratchet to `error` in follow-up
        // commits once the call-site sweep lands.
        rules: {
            'svelte/no-navigation-without-resolve': 'warn',
            'svelte/require-each-key': 'warn',
            'svelte/prefer-svelte-reactivity': 'warn',
            // `preserve-caught-error` (real error-chain hygiene); rule
            // name is unscoped in eslint-plugin-svelte's flat preset.
            'preserve-caught-error': 'warn',
            // ESLint 10 flags rune-destructured-default patterns
            // (`isProcessingCSV = $bindable()`) as unused assignments
            // because the parser can't see the through-prop write.
            // Downgrade until plugin-svelte recognizes the pattern.
            'no-useless-assignment': 'warn',
        },
    },
    {
        // SvelteKit-generated files (regenerated on every build).
        ignores: [
            '**/.svelte-kit/**',
            '**/build/**',
            '**/dist/**',
            '**/.wrangler/**',
            // ESLint flat config can't lint JSON; the Prettier check
            // covers JSON formatting separately.
            '**/*.json',
        ],
    },
);
