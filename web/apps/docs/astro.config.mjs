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
			head: [
				{
					tag: 'script',
					attrs: { type: 'module', src: '/mermaid-init.js' },
				},
			],
			social: [
				{ icon: 'x.com', label: 'X', href: 'https://x.com/trionlabs' },
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
