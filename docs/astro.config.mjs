// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://bettaku.github.io',
	base: '/engawa',
	integrations: [
		starlight({
			title: 'engawa',
			defaultLocale: 'root',
			locales: {
				root: { label: '日本語', lang: 'ja' },
				en: { label: 'English' },
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/bettaku/engawa' },
			],
			editLink: {
				baseUrl: 'https://github.com/bettaku/engawa/edit/develop/docs/',
			},
			sidebar: [
				{
					label: 'engawaについて',
					translations: { en: 'About engawa' },
					items: [{ autogenerate: { directory: 'intro' } }],
				}, {
					label: '開発者向け',
					translations: { en: 'Development' },
					items: [{ autogenerate: { directory: 'development' } }],
				}, {
					label: 'インストール',
					translations: { en: 'Install' },
					items: [{ autogenerate: { directory: 'install' } }],
				},
			],
		}),
	],
});
