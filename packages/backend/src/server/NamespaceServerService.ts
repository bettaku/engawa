/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

// TODO: ここのnamespaceで定義している部分はそのうちDBから引っ張りたい
@Injectable()
export class NamespaceServerService {
	constructor() {}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.get('/', async (request, reply) => {
			const namespace = {
				'@context': {
					'xsd': 'http://www.w3.org/2001/XMLSchema#',
					'schema': 'http://schema.org/',
					'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
					'owl': 'http://www.w3.org/2002/07/owl#',
					'engawa': 'https://c.koliosky.com/ns#',

					'chatScope': {
						'@id': 'engawa:chatScope',
						'@type': 'rdfs:Property',
						'rdfs:comment': 'Defines user\'s chat acceptance settings.',
						'rdfs:domain': 'https://www.w3.org/ns/activitystreams#Person',
						'rdfs:range': 'engawa:ChatScopeValue',
					},
					'ChatScopeValue': {
						'@id': 'engawa:ChatScopeValue',
						'@type': 'rdfs:Datatype',
						'rdfs:comment': 'The value type for chatScope property. Available values are "everyone", "followers", "following", "mutual", and "none". If not set, we consider it as "none".',
						'owl:oneOf': [
							{ '@value': 'everyone' },
							{ '@value': 'followers' },
							{ '@value': 'following' },
							{ '@value': 'mutual' },
							{ '@value': 'none' },
						],
					},
					'everyone': {
						'@id': 'engawa:everyone',
						'@type': 'ChatScopeValue',
						'rdfs:comment': 'Accept chat messages from everyone.',
					},
					'followers': {
						'@id': 'engawa:followers',
						'@type': 'ChatScopeValue',
						'rdfs:comment': 'Accept chat messages from followers only.',
					},
					'following': {
						'@id': 'engawa:following',
						'@type': 'ChatScopeValue',
						'rdfs:comment': 'Accept chat messages from users you are following only.',
					},
					'mutual': {
						'@id': 'engawa:mutual',
						'@type': 'ChatScopeValue',
						'rdfs:comment': 'Accept chat messages from users who are mutually following each other only.',
					},
					'none': {
						'@id': 'engawa:none',
						'@type': 'ChatScopeValue',
						'rdfs:comment': 'Do not accept chat messages from anyone. If chatScope is not set, this value is the default.',
					},
				},
			};

			reply
				.type('application/ld+json')
				.header('Cache-Control', 'public, max-age=600')
				.header('Access-Control-Allow-Headers', 'Accept')
				.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
				.header('Access-Control-Allow-Origin', '*')
				.header('Access-Control-Expose-Headers', 'Vary');

			return { ...namespace };
		});

		done();
	}
}
