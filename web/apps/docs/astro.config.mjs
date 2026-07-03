// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://docs.zarf.to',
	integrations: [
		starlight({
			title: 'Zarf Docs',
			description:
				'Confidential token distributions and payroll on Stellar — documentation for recipients, creators, and developers.',
			favicon: '/favicon.svg',
			logo: {
				light: './src/assets/logo-light.svg',
				dark: './src/assets/logo-dark.svg',
				alt: 'Zarf',
			},
			// Zen design system — matches zarf.to / create / claim.
			customCss: ['./src/styles/theme.css'],
			// Syntax themes: neutral, high-contrast pairs that read well on the
			// smoky-porcelain surfaces. Frame chrome is retuned in theme.css.
			expressiveCode: {
				themes: ['github-dark', 'github-light'],
				styleOverrides: {
					borderRadius: '0.75rem',
					borderColor: 'var(--sl-color-hairline)',
					codeFontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
					frames: {
						shadowColor: 'transparent',
					},
				},
			},
			head: [
				// Brand fonts — Saira (text) + JetBrains Mono (code), matching landing.
				{ tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
				{
					tag: 'link',
					attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true },
				},
				{
					tag: 'link',
					attrs: {
						rel: 'stylesheet',
						href: 'https://fonts.googleapis.com/css2?family=Saira:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
					},
				},
				// Theme color for mobile browser chrome.
				{
					tag: 'meta',
					attrs: {
						name: 'theme-color',
						content: '#f8f8fa',
						media: '(prefers-color-scheme: light)',
					},
				},
				{
					tag: 'meta',
					attrs: {
						name: 'theme-color',
						content: '#121212',
						media: '(prefers-color-scheme: dark)',
					},
				},
				{
					tag: 'script',
					attrs: { type: 'module', src: '/mermaid-init.js' },
				},
			],
			social: [
				{ icon: 'x.com', label: 'X', href: 'https://x.com/zarfto' },
				{ icon: 'email', label: 'Contact', href: 'mailto:contact@trionlabs.dev' },
			],
			sidebar: [
				{ label: 'Learn', items: [{ autogenerate: { directory: 'learn' } }] },
				{ label: 'For Recipients', items: [{ autogenerate: { directory: 'recipients' } }] },
				{ label: 'For Creators', items: [{ autogenerate: { directory: 'creators' } }] },
				{ label: 'For Developers', items: [{ autogenerate: { directory: 'developers' } }] },
				{ label: 'Resources', items: [{ autogenerate: { directory: 'resources' } }] },
			],
		}),
	],
});
