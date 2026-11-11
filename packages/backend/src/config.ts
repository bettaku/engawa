/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import cluster from 'node:cluster';
import { parseConfigSource, configPath, ConfigValidationError, formatDiagnostic } from './config/parse.js';
import type { ConfigInput, RedisOptionsSource } from './config/types.js';
import { type FastifyServerOptions } from 'fastify';
import { resolveViteEntry, type ViteEntry } from './misc/vite-entry.js';
import type * as Sentry from '@sentry/node';
import type * as SentryVue from '@sentry/vue';
import type { RedisOptions } from 'ioredis';

export type { FulltextSearchProvider } from './config/types.js';

export type Config = {
	url: string;
	port: number;
	socket: string | undefined;
	trustProxy: FastifyServerOptions['trustProxy'];
	chmodSocket: string | undefined;
	disableHsts: boolean | undefined;
	db: ConfigInput['db'] & { db: string; user: string; pass: string };
	dbReplications: boolean | undefined;
	dbSlaves: ConfigInput['dbSlaves'];
	fulltextSearch?: ConfigInput['fulltextSearch'];
	meilisearch: ConfigInput['meilisearch'];
	elasticsearch: ConfigInput['elasticsearch'];
	proxy: string | undefined;
	proxySmtp: string | undefined;
	proxyBypassHosts: string[] | undefined;
	allowedPrivateNetworks: string[] | undefined;
	maxFileSize: number;
	clusterLimit: number | undefined;
	id: string;
	outgoingAddress: string | undefined;
	outgoingAddressFamily: 'ipv4' | 'ipv6' | 'dual' | undefined;
	deliverJobConcurrency: number | undefined;
	inboxJobConcurrency: number | undefined;
	relationshipJobConcurrency: number | undefined;
	deliverJobPerSec: number | undefined;
	inboxJobPerSec: number | undefined;
	relationshipJobPerSec: number | undefined;
	deliverJobMaxAttempts: number | undefined;
	inboxJobMaxAttempts: number | undefined;
	cloudLogging?: ConfigInput['cloudLogging'];
	apFileBaseUrl: string | undefined;
	logging?: ConfigInput['logging'];

	version: string;
	basedMisskeyVersion: string;
	publishTarballInsteadOfProvideRepositoryUrl: boolean;
	setupPassword: string | undefined;
	host: string;
	hostname: string;
	scheme: string;
	wsScheme: string;
	apiUrl: string;
	wsUrl: string;
	authUrl: string;
	driveUrl: string;
	userAgent: string;
	frontendEntry: ViteEntry;
	frontendManifestExists: boolean;
	frontendEmbedEntry: ViteEntry;
	frontendEmbedManifestExists: boolean;
	mediaProxy: string;
	externalMediaProxyEnabled: boolean;
	videoThumbnailGenerator: string | null;
	redis: RedisOptions & RedisOptionsSource;
	redisForPubsub: RedisOptions & RedisOptionsSource;
	redisForJobQueue: RedisOptions & RedisOptionsSource;
	redisForTimelines: RedisOptions & RedisOptionsSource;
	redisForReactions: RedisOptions & RedisOptionsSource;
	sentryForBackend: { options: Partial<Sentry.NodeOptions>; enableNodeProfiling?: boolean; } | undefined;
	sentryForFrontend: {
		options: Partial<SentryVue.BrowserOptions> & { dsn: string };
		vueIntegration?: SentryVue.VueIntegrationOptions | null;
		browserTracingIntegration?: Parameters<typeof SentryVue.browserTracingIntegration>[0] | null;
		replayIntegration?: Parameters<typeof SentryVue.replayIntegration>[0] | null;
	} | undefined;
	perChannelMaxNoteCacheCount: number;
	perUserNotificationsMaxCount: number;
	deactivateAntennaThreshold: number;
	pidFile?: string;
};

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

export const path = configPath();
let cached: Config | undefined;

export function loadConfig(): Config {
	if (cached) return cached;
	const mode = process.env.CHERRYPICK_CONFIG_VALIDATION;
	const { source, diagnostics } = parseConfigSource(path);
	if (mode === 'error' && diagnostics.some(d => d.level === 'error')) {
		throw new ConfigValidationError(diagnostics);
	}
	if (cluster.isPrimary && process.env.NODE_ENV !== 'test') {
		for (const diagnostic of diagnostics) console.warn(formatDiagnostic(diagnostic));
	}
	cached = deriveConfig(source);
	return cached;
}

function deriveConfig(config: ConfigInput): Config {
	const meta = JSON.parse(fs.readFileSync(`${_dirname}/../../../built/meta.json`, 'utf-8'));

	const frontendManifestExists = fs.existsSync(_dirname + '/../../../built/_frontend_vite_/manifest.json');
	const frontendEmbedManifestExists = fs.existsSync(_dirname + '/../../../built/_frontend_embed_vite_/manifest.json');
	const frontendManifest = frontendManifestExists ?
		JSON.parse(fs.readFileSync(`${_dirname}/../../../built/_frontend_vite_/manifest.json`, 'utf-8'))
		: { 'src/_boot_.ts': { file: null } };
	const frontendEmbedManifest = frontendEmbedManifestExists ?
		JSON.parse(fs.readFileSync(`${_dirname}/../../../built/_frontend_embed_vite_/manifest.json`, 'utf-8'))
		: { 'src/boot.ts': { file: null } };

	const url = tryCreateUrl(config.url ?? '');
	const version = meta.version;
	const basedMisskeyVersion = meta.basedMisskeyVersion;
	const host = url.host;
	const hostname = url.hostname;
	const scheme = url.protocol.replace(/:$/, '');
	const wsScheme = scheme.replace('http', 'ws');

	const dbDb = config.db.db ?? '';
	const dbUser = config.db.user ?? '';
	const dbPass = config.db.pass ?? '';

	const externalMediaProxy = config.mediaProxy ?
		config.mediaProxy.endsWith('/') ? config.mediaProxy.substring(0, config.mediaProxy.length - 1) : config.mediaProxy
		: null;
	const internalMediaProxy = `${scheme}://${host}/proxy`;

	const redis = convertRedisOptions(config.redis, host);

	return {
		version,
		basedMisskeyVersion,
		publishTarballInsteadOfProvideRepositoryUrl: !!config.publishTarballInsteadOfProvideRepositoryUrl,
		setupPassword: config.setupPassword,
		url: url.origin,
		port: config.port ?? NaN,
		socket: config.socket,
		// Fastify also accepts a numeric hop count in lib/request.js.
		trustProxy: config.trustProxy as FastifyServerOptions['trustProxy'],
		chmodSocket: config.chmodSocket,
		disableHsts: config.disableHsts,
		host,
		hostname,
		scheme,
		wsScheme,
		wsUrl: `${wsScheme}://${host}`,
		apiUrl: `${scheme}://${host}/api`,
		authUrl: `${scheme}://${host}/auth`,
		driveUrl: `${scheme}://${host}/files`,
		db: { ...config.db, db: dbDb, user: dbUser, pass: dbPass },
		dbReplications: config.dbReplications,
		dbSlaves: config.dbSlaves,
		fulltextSearch: config.fulltextSearch,
		meilisearch: config.meilisearch,
		elasticsearch: config.elasticsearch,
		redis,
		redisForPubsub: config.redisForPubsub ? convertRedisOptions(config.redisForPubsub, host) : redis,
		redisForJobQueue: config.redisForJobQueue ? convertRedisOptions(config.redisForJobQueue, host) : redis,
		redisForTimelines: config.redisForTimelines ? convertRedisOptions(config.redisForTimelines, host) : redis,
		redisForReactions: config.redisForReactions ? convertRedisOptions(config.redisForReactions, host) : redis,
		sentryForBackend: config.sentryForBackend,
		sentryForFrontend: config.sentryForFrontend,
		id: config.id,
		proxy: config.proxy,
		proxySmtp: config.proxySmtp,
		proxyBypassHosts: config.proxyBypassHosts,
		allowedPrivateNetworks: config.allowedPrivateNetworks,
		maxFileSize: config.maxFileSize ?? 262144000,
		clusterLimit: config.clusterLimit,
		outgoingAddress: config.outgoingAddress,
		outgoingAddressFamily: config.outgoingAddressFamily,
		deliverJobConcurrency: config.deliverJobConcurrency,
		inboxJobConcurrency: config.inboxJobConcurrency,
		relationshipJobConcurrency: config.relationshipJobConcurrency,
		deliverJobPerSec: config.deliverJobPerSec,
		inboxJobPerSec: config.inboxJobPerSec,
		relationshipJobPerSec: config.relationshipJobPerSec,
		deliverJobMaxAttempts: config.deliverJobMaxAttempts,
		inboxJobMaxAttempts: config.inboxJobMaxAttempts,
		cloudLogging: config.cloudLogging,
		apFileBaseUrl: config.apFileBaseUrl,
		mediaProxy: externalMediaProxy ?? internalMediaProxy,
		externalMediaProxyEnabled: externalMediaProxy !== null && externalMediaProxy !== internalMediaProxy,
		videoThumbnailGenerator: config.videoThumbnailGenerator ?
			config.videoThumbnailGenerator.endsWith('/') ? config.videoThumbnailGenerator.substring(0, config.videoThumbnailGenerator.length - 1) : config.videoThumbnailGenerator
			: null,
		userAgent: `Engawa/${version} (${url.origin})`,
		frontendEntry: resolveViteEntry(frontendManifest, 'src/_boot_.ts'),
		frontendManifestExists: frontendManifestExists,
		frontendEmbedEntry: resolveViteEntry(frontendEmbedManifest, 'src/boot.ts'),
		frontendEmbedManifestExists: frontendEmbedManifestExists,
		perChannelMaxNoteCacheCount: config.perChannelMaxNoteCacheCount ?? 1000,
		perUserNotificationsMaxCount: config.perUserNotificationsMaxCount ?? 500,
		deactivateAntennaThreshold: config.deactivateAntennaThreshold ?? (1000 * 60 * 60 * 24 * 7),
		pidFile: config.pidFile,
		logging: config.logging,
	};
}

function tryCreateUrl(url: string) {
	try {
		return new URL(url);
	} catch {
		throw new Error('/url must be a valid URL');
	}
}

export function convertRedisOptions(options: RedisOptionsSource & RedisOptions, host: string): RedisOptions & RedisOptionsSource {
	return {
		...options,
		password: options.pass ?? options.password,
		prefix: options.prefix ?? host,
		family: options.family ?? 0,
		keyPrefix: options.keyPrefix ?? `${options.prefix ?? host}:`,
		db: options.db ?? 0,
	};
}
