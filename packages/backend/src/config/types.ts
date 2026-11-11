/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type FulltextSearchProvider =
	| "sqlLike"
	| "sqlPgroonga"
	| "meilisearch"
	| "elasticsearch";

export type RedisOptionsSource = {
	host?: string;
	port?: number;
	path?: string;
	family?: number;
	pass?: string;
	db?: number;
	prefix?: string;
};

/**
 * 設定ファイルの型
 */
export type ConfigInput = {
	url?: string;
	port?: number;
	socket?: string;
	trustProxy?: boolean | string | string[] | number;
	chmodSocket?: string;
	disableHsts?: boolean;
	db: {
		host: string;
		port: number;
		db?: string;
		user?: string;
		pass?: string;
		disableCache?: boolean;
		extra?: Record<string, unknown>;
	};
	dbReplications?: boolean;
	dbSlaves?: {
		host: string;
		port: number;
		db: string;
		user: string;
		pass: string;
	}[];
	redis: RedisOptionsSource;
	redisForPubsub?: RedisOptionsSource;
	redisForJobQueue?: RedisOptionsSource;
	redisForTimelines?: RedisOptionsSource;
	redisForReactions?: RedisOptionsSource;
	fulltextSearch?: {
		provider?: FulltextSearchProvider;
	};
	meilisearch?: {
		host: string;
		port: number | string;
		apiKey: string;
		ssl?: boolean;
		index: string;
		locale?: string[];
		scope?: "local" | "global" | string[];
	};
	elasticsearch?: {
		host: string;
		port: number;
		user: string;
		pass: string;
		ssl?: boolean;
		index: string;
		rejectUnauthorized?: boolean;
		scope?: "local" | "global" | string[];
		pingTimeout?: number;
		requestTimeout?: number;
	};
	sentryForBackend?: {
		options: Record<string, unknown>;
		enableNodeProfiling?: boolean;
	};
	sentryForFrontend?: {
		options: { dsn: string };
		vueIntegration?: Record<string, unknown> | null;
		browserTracingIntegration?: Record<string, unknown> | null;
		replayIntegration?: Record<string, unknown> | null;
	};

	proxyRemoteFiles?: boolean;
	signToActivityPubGet?: boolean;
	disallowExternalApRedirect?: boolean;
	publishTarballInsteadOfProvideRepositoryUrl?: boolean;

	setupPassword?: string;

	proxy?: string;
	proxySmtp?: string;
	proxyBypassHosts?: string[];

	allowedPrivateNetworks?: string[];

	maxFileSize?: number;

	clusterLimit?: number;

	id: string;

	outgoingAddress?: string;
	outgoingAddressFamily?: "ipv4" | "ipv6" | "dual";

	deliverJobConcurrency?: number;
	inboxJobConcurrency?: number;
	relationshipJobConcurrency?: number;
	deliverJobPerSec?: number;
	inboxJobPerSec?: number;
	relationshipJobPerSec?: number;
	deliverJobMaxAttempts?: number;
	inboxJobMaxAttempts?: number;

	cloudLogging?: {
		projectId: string;
		saKeyPath: string;
		logName?: string;
	};

	apFileBaseUrl?: string;

	mediaProxy?: string;
	videoThumbnailGenerator?: string;

	perChannelMaxNoteCacheCount?: number;
	perUserNotificationsMaxCount?: number;
	deactivateAntennaThreshold?: number;
	pidFile?: string;

	logging?: {
		sql?: {
			disableQueryTruncation?: boolean;
			enableQueryParamLogging?: boolean;
		};
	};
};

export type ConfigEffective = ConfigInput & {
	url: string;
	db: { db: string; user: string };
};
