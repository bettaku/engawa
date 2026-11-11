/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Ajv2020 } from 'ajv/dist/2020.js';
import type { RedisOptions } from 'ioredis';
import type { JSONSchemaType } from 'ajv';
import type { ConfigInput, ConfigEffective } from './types.js';

const string = { type: 'string' } as const;
const integer = { type: 'integer', minimum: 0 } as const;
const port = { ...integer, minimum: 1, maximum: 65535 };
// Decimal string form of 1-65535.
const portPattern =
	'^([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$';
const timeout = { type: 'number', minimum: 0 } as const;
const secret = { ...string, 'x-secret': true };
const list = { type: 'array', items: string, nullable: true } as const;
const text = { ...string, nullable: true } as const;
const flag = { type: 'boolean', nullable: true } as const;
const count = { ...integer, minimum: 1, nullable: true } as const;
const unset = { nullable: true, 'x-null-as-unset': true } as const;
const options = { type: 'object', additionalProperties: true } as const;

function object<const P, const K extends readonly (keyof P)[]>(
	properties: P,
	...required: K
) {
	return {
		type: 'object',
		properties,
		required,
		additionalProperties: false,
	} as const;
}

// ioredis accepts these additional connection options. Preserve its handling of
// their values while still catching misspelled CherryPick and ioredis keys.
const redisDriverKeys = [
	'path',
	'tls',
	'connectTimeout',
	'disconnectTimeout',
	'commandTimeout',
	'socketTimeout',
	'keepAlive',
	'noDelay',
	'connectionName',
	'disableClientInfo',
	'clientInfoTag',
	'password',
	'autoResubscribe',
	'autoResendUnfulfilledCommands',
	'readOnly',
	'stringNumbers',
	'monitor',
	'maxRetriesPerRequest',
	'maxLoadingRetryTime',
	'enableAutoPipelining',
	'autoPipeliningIgnoredCommands',
	'offlineQueue',
	'commandQueue',
	'enableOfflineQueue',
	'enableReadyCheck',
	'lazyConnect',
	'scripts',
	'name',
	'role',
	'sentinelUsername',
	'sentinelPassword',
	'sentinels',
	'preferredSlaves',
	'sentinelCommandTimeout',
	'enableTLSForSentinelMode',
	'sentinelTLS',
	'natMap',
	'updateSentinels',
	'sentinelMaxConnections',
	'failoverDetector',
	'keyPrefix',
	'showFriendlyErrorStack',
	'Connector',
	'retryStrategy',
	'reconnectOnError',
	'sentinelRetryStrategy',
	'sentinelReconnectStrategy',
] satisfies (keyof RedisOptions)[];
const redisObject = object(
	{
		...Object.fromEntries(redisDriverKeys.map((key) => [key, {}])),
		path: { ...string, ...unset, minLength: 1 },
		connectTimeout: timeout,
		disconnectTimeout: timeout,
		commandTimeout: timeout,
		socketTimeout: timeout,
		host: { ...string, ...unset },
		port: { ...port, ...unset },
		pass: { ...secret, nullable: true },
		username: text,
		family: { ...integer, ...unset, enum: [0, 4, 6, null] },
		db: { ...integer, ...unset },
		prefix: { ...string, ...unset },
	},
);
// ioredis ignores host and port when connecting through a Unix socket path.
const redis = {
	...redisObject,
	anyOf: [
		{ properties: { path: {} }, required: ['path'] },
		{ properties: { host: {}, port: {} }, required: ['host', 'port'] },
	],
};
const fallbackRedis = { ...redis, ...unset };
const db = object(
	{
		host: string,
		port,
		db: { ...string, ...unset, 'x-env': 'DATABASE_DB' },
		user: { ...string, ...unset, 'x-env': 'DATABASE_USER' },
		pass: { ...secret, ...unset, 'x-env': 'DATABASE_PASSWORD' },
		disableCache: flag,
		extra: { ...options, nullable: true },
	},
	'host',
	'port',
);
const scope = { $ref: '#/$defs/scope' };
const noEffect = { deprecated: true, 'x-deprecation': 'no-effect' };
const migrationOnly = {
	...flag,
	deprecated: true,
	'x-deprecation': 'migration-only',
	description: 'Legacy setting used only when migrating the database.',
};
const removal = (issue: number) => ({
	deprecated: true,
	'x-deprecation': 'scheduled-removal',
	description: `Scheduled for removal (https://github.com/bettaku/engawa/issues/${issue})`,
});

const properties = {
	url: {
		...string,
		...unset,
		'x-env': 'CHERRYPICK_URL',
		description: 'Public URL of this instance.',
	},
	port: {
		...port,
		...unset,
		'x-env': 'PORT',
		description: 'HTTP listen port. Optional when using a Unix socket.',
	},
	socket: {
		...text,
		minLength: 1,
		description: 'Unix socket to listen on instead of a TCP port.',
	},
	chmodSocket: { ...text, description: 'File mode for the Unix socket.' },
	trustProxy: {
		$ref: '#/$defs/trustProxy',
		description: 'Trusted reverse proxies or maximum trusted hop count.',
	},
	disableHsts: {
		...flag,
		description: 'Disable the Strict-Transport-Security header.',
	},
	id: {
		...string,
		// The value is case-insensitive. Editors only see the published schema, so
		// list the uppercase spellings used in existing configuration files too.
		enum: [
			'aid', 'aidx', 'meid', 'meidg', 'ulid', 'objectid',
			'AID', 'AIDX', 'MEID', 'MEIDG', 'ULID', 'OBJECTID',
		],
		description: 'ID generation method.',
	},
	db: { ...db, description: 'Primary PostgreSQL connection.' },
	dbReplications: { ...flag, description: 'Enable PostgreSQL read replicas.' },
	dbSlaves: {
		type: 'array',
		nullable: true,
		items: object(
			{ host: string, port, db: string, user: string, pass: secret },
			'host',
			'port',
			'db',
			'user',
			'pass',
		),
		description: 'PostgreSQL replica connections.',
	},
	redis: {
		...redis,
		description: 'Default Redis connection and ioredis options.',
	},
	redisForPubsub: {
		...fallbackRedis,
		description: 'Redis connection for pub/sub. Defaults to redis.',
	},
	redisForJobQueue: {
		...fallbackRedis,
		description: 'Redis connection for job queues. Defaults to redis.',
	},
	redisForTimelines: {
		...fallbackRedis,
		description: 'Redis connection for timelines. Defaults to redis.',
	},
	redisForReactions: {
		...fallbackRedis,
		description: 'Redis connection for reactions. Defaults to redis.',
	},
	fulltextSearch: {
		...object({
			provider: {
				...string,
				...unset,
				enum: ['sqlLike', 'sqlPgroonga', 'meilisearch', 'elasticsearch', null],
			},
		}),
		nullable: true,
		description: 'Full-text search provider.',
	},
	meilisearch: {
		...object(
			{
				host: string,
				port: { anyOf: [port, { ...string, pattern: portPattern }] },
				apiKey: secret,
				index: string,
				ssl: flag,
				scope,
				locale: list,
			},
			'host',
			'port',
			'apiKey',
			'index',
		),
		nullable: true,
		...removal(325),
	},
	elasticsearch: {
		...object(
			{
				host: string,
				port,
				user: string,
				pass: secret,
				index: string,
				ssl: flag,
				scope,
				rejectUnauthorized: flag,
				pingTimeout: count,
				requestTimeout: count,
			},
			'host',
			'port',
			'user',
			'pass',
			'index',
		),
		nullable: true,
		description: 'Elasticsearch connection and indexing options.',
	},
	sentryForBackend: {
		...object(
			{
				options: {
					...options,
					properties: {
						dsn: { $ref: '#/$defs/optionalSecret', 'x-secret': true },
					},
				},
				enableNodeProfiling: flag,
			},
			'options',
		),
		nullable: true,
		description: 'Backend Sentry SDK options and profiling.',
	},
	sentryForFrontend: {
		...object(
			{
				options: {
					...options,
					properties: { dsn: { $ref: '#/$defs/secret', 'x-secret': true } },
					required: ['dsn'],
				},
				vueIntegration: { ...options, nullable: true },
				browserTracingIntegration: { ...options, nullable: true },
				replayIntegration: { ...options, nullable: true },
			},
			'options',
		),
		nullable: true,
		description:
			'Browser Sentry options. Set an integration to null to enable its defaults.',
	},
	publishTarballInsteadOfProvideRepositoryUrl: {
		...flag,
		description: 'Publish a source tarball at build time.',
	},
	setupPassword: {
		...secret,
		nullable: true,
		description: 'Password required to create the initial administrator.',
	},
	proxy: {
		...text,
		description: 'Proxy for outbound HTTP and HTTPS requests.',
	},
	proxySmtp: { ...text, description: 'Proxy for outbound SMTP connections.' },
	proxyBypassHosts: {
		...list,
		description: 'Hosts that bypass the HTTP proxy.',
	},
	allowedPrivateNetworks: {
		...list,
		description: 'Private networks allowed for fetching attachments.',
	},
	maxFileSize: {
		...count,
		...unset,
		description:
			'Maximum upload or download size in bytes (default 262144000).',
	},
	clusterLimit: {
		...count,
		description: 'Maximum number of worker processes.',
	},
	outgoingAddress: {
		...text,
		description: 'Local address used for outgoing requests.',
	},
	outgoingAddressFamily: {
		...text,
		...unset,
		enum: ['ipv4', 'ipv6', 'dual', null],
		...noEffect,
		description: 'Deprecated IP family selection. Has no effect.',
	},
	deliverJobConcurrency: {
		...count,
		description: 'Concurrent jobs per worker for the deliver queue.',
	},
	inboxJobConcurrency: {
		...count,
		description: 'Concurrent jobs per worker for the inbox queue.',
	},
	relationshipJobConcurrency: {
		...count,
		description: 'Concurrent jobs per worker for the relationship queue.',
	},
	deliverJobPerSec: {
		...count,
		description: 'Maximum jobs per second for the deliver queue.',
	},
	inboxJobPerSec: {
		...count,
		description: 'Maximum jobs per second for the inbox queue.',
	},
	relationshipJobPerSec: {
		...count,
		description: 'Maximum jobs per second for the relationship queue.',
	},
	deliverJobMaxAttempts: {
		...count,
		description: 'Maximum attempts per job for the deliver queue.',
	},
	inboxJobMaxAttempts: {
		...count,
		description: 'Maximum attempts per job for the inbox queue.',
	},
	cloudLogging: {
		...object(
			{ projectId: string, saKeyPath: string, logName: text },
			'projectId',
			'saKeyPath',
		),
		nullable: true,
		description:
			'Google Cloud Logging project and service account configuration.',
	},
	apFileBaseUrl: {
		...text,
		description: 'Override the ActivityPub file URL for object storage.',
	},
	mediaProxy: { ...text, description: 'External media proxy URL.' },
	videoThumbnailGenerator: { ...text, ...removal(326) },
	perChannelMaxNoteCacheCount: {
		...integer,
		...unset,
		...noEffect,
		description: 'Deprecated channel note cache limit. Has no effect.',
	},
	perUserNotificationsMaxCount: {
		...integer,
		...unset,
		description: 'Maximum notifications per user (default 500).',
	},
	deactivateAntennaThreshold: {
		...integer,
		...unset,
		description:
			'Antenna inactivity threshold in milliseconds (default 604800000).',
	},
	pidFile: { ...text, description: 'Path for the master process ID file.' },
	logging: {
		...object({
			sql: {
				...object({
					disableQueryTruncation: flag,
					enableQueryParamLogging: flag,
				}),
				nullable: true,
			},
		}),
		nullable: true,
		description: 'SQL query logging options.',
	},
	proxyRemoteFiles: migrationOnly,
	signToActivityPubGet: migrationOnly,
	disallowExternalApRedirect: migrationOnly,
} as const;

// Selecting an external search engine requires its connection settings.
const requireSearchConnection = (provider: 'meilisearch' | 'elasticsearch') => ({
	if: {
		properties: {
			fulltextSearch: {
				type: 'object',
				properties: { provider: { const: provider } },
				required: ['provider'],
			},
		},
		required: ['fulltextSearch'],
	},
	then: {
		properties: { [provider]: { type: 'object' } },
		required: [provider],
	},
});
const input = {
	...object(properties, 'db', 'redis', 'id'),
	allOf: [
		requireSearchConnection('meilisearch'),
		requireSearchConnection('elasticsearch'),
	],
} satisfies JSONSchemaType<ConfigInput>;
const effective = {
	...object(
		{
			...properties,
			url: { ...properties.url, nullable: false },
			db: object(
				{
					...db.properties,
					db: { ...db.properties.db, nullable: false },
					user: { ...db.properties.user, nullable: false },
				},
				'host',
				'port',
				'db',
				'user',
			),
		},
		'db',
		'redis',
		'id',
		'url',
	),
	if: {
		properties: { socket: { type: 'string', minLength: 1 } },
		required: ['socket'],
	},
	else: { properties: { port }, required: ['port'] },
} satisfies JSONSchemaType<ConfigEffective>;

export const schema = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	$ref: '#/$defs/input',
	$defs: {
		input,
		effective,
		secret,
		optionalSecret: { ...secret, nullable: true },
		scope: { anyOf: [{ enum: ['local', 'global'] }, list] },
		trustProxy: { anyOf: [{ type: 'boolean' }, string, list, integer] },
	},
};

export function createValidators() {
	const ajv = new Ajv2020({
		allErrors: true,
		strict: true,
		ownProperties: true,
	});
	for (const [keyword, schemaType] of Object.entries({
		'x-env': 'string',
		'x-secret': 'boolean',
		'x-deprecation': 'string',
		'x-null-as-unset': 'boolean',
	} as const)) ajv.addKeyword({ keyword, schemaType });
	ajv.addSchema(schema, 'config');
	return {
		input: ajv.compile<ConfigInput>({ $ref: 'config#/$defs/input' }),
		effective: ajv.compile<ConfigEffective>({
			$ref: 'config#/$defs/effective',
		}),
	};
}

// Ajv's OpenAPI nullable extension changes only the type, never enum or const.
export function standardSchema(): unknown {
	return JSON.parse(
		JSON.stringify(schema, (_key, value) => {
			if (value && typeof value === 'object' && 'nullable' in value) {
				const { nullable, ...rest } = value;
				if (nullable) rest.type = [rest.type, 'null'];
				return rest;
			}
			return value;
		}),
	);
}
