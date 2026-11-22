/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { ModuleRef } from '@nestjs/core';
import { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Config } from '@/config.js';
import type { InstancesRepository, AccessTokensRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import endpoints from './endpoints.js';
import { errorBody, errorForStatus, httpErrors } from './http-errors.js';
import { ApiCallService } from './ApiCallService.js';
import { ApiLoggerService } from './ApiLoggerService.js';
import { SignupApiService } from './SignupApiService.js';
import { SigninApiService } from './SigninApiService.js';
import { SigninWithPasskeyApiService } from './SigninWithPasskeyApiService.js';
import type { FastifyError, FastifyInstance, FastifyPluginOptions, FastifyReply } from 'fastify';

@Injectable()
export class ApiServerService {
	constructor(
		private moduleRef: ModuleRef,

		@Inject(DI.config)
		private config: Config,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		@Inject(DI.accessTokensRepository)
		private accessTokensRepository: AccessTokensRepository,

		private userEntityService: UserEntityService,
		private apiCallService: ApiCallService,
		private signupApiService: SignupApiService,
		private signinApiService: SigninApiService,
		private signinWithPasskeyApiService: SigninWithPasskeyApiService,
		private apiLoggerService: ApiLoggerService,
	) {
		//this.createServer = this.createServer.bind(this);
	}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.register(cors, {
			origin: '*',
		});

		fastify.register(multipart, {
			limits: {
				fileSize: this.config.maxFileSize,
				files: 1,
			},
		});

		// Prevent cache
		fastify.addHook('onRequest', (request, reply, done) => {
			reply.header('Cache-Control', 'private, max-age=0, must-revalidate');
			done();
		});

		for (const endpoint of endpoints) {
			const ep = {
				name: endpoint.name,
				meta: endpoint.meta,
				params: endpoint.params,
				exec: this.moduleRef.get('ep:' + endpoint.name, { strict: false }).exec,
			};

			if (endpoint.meta.requireFile) {
				fastify.all<{
					Params: { endpoint: string; },
					Body: Record<string, unknown>,
					Querystring: Record<string, unknown>,
				}>('/' + endpoint.name, async (request, reply) => {
					if (request.method === 'GET' && !endpoint.meta.allowGet) {
						reply.code(405);
						reply.send(errorBody(httpErrors.methodNotAllowed));
						return;
					}

					// Await so that any error can automatically be translated to HTTP 500
					await this.apiCallService.handleMultipartRequest(ep, request, reply);
					return reply;
				});
			} else {
				fastify.all<{
					Params: { endpoint: string; },
					Body: Record<string, unknown>,
					Querystring: Record<string, unknown>,
				}>('/' + endpoint.name, { bodyLimit: 1024 * 1024 }, async (request, reply) => {
					if (request.method === 'GET' && !endpoint.meta.allowGet) {
						reply.code(405);
						reply.send(errorBody(httpErrors.methodNotAllowed));
						return;
					}

					// Await so that any error can automatically be translated to HTTP 500
					await this.apiCallService.handleRequest(ep, request, reply);
					return reply;
				});
			}
		}

		fastify.post<{
			Body: {
				username: string;
				password: string;
				host?: string;
				invitationCode?: string;
				emailAddress?: string;
				'hcaptcha-response'?: string;
				'g-recaptcha-response'?: string;
				'turnstile-response'?: string;
				'm-captcha-response'?: string;
				'testcaptcha-response'?: string;
			}
		}>('/signup', (request, reply) => this.signupApiService.signup(request, reply));

		fastify.post<{
			Body: {
				username: string;
				password?: string;
				token?: string;
				credential?: AuthenticationResponseJSON;
				'hcaptcha-response'?: string;
				'g-recaptcha-response'?: string;
				'turnstile-response'?: string;
				'm-captcha-response'?: string;
				'testcaptcha-response'?: string;
			};
		}>('/signin-flow', (request, reply) => this.signinApiService.signin(request, reply));

		fastify.post<{
			Body: {
				credential?: AuthenticationResponseJSON;
				context?: string;
			};
		}>('/signin-with-passkey', (request, reply) => this.signinWithPasskeyApiService.signin(request, reply));

		fastify.post<{ Body: { code: string; } }>('/signup-pending', (request, reply) => this.signupApiService.signupPending(request, reply));

		fastify.get('/v1/instance/peers', async (request, reply) => {
			const instances = await this.instancesRepository.find({
				select: ['host'],
				where: {
					suspensionState: 'none',
				},
			});

			return instances.map(instance => instance.host);
		});

		fastify.post<{ Params: { session: string; } }>('/miauth/:session/check', async (request, reply) => {
			const token = await this.accessTokensRepository.findOneBy({
				session: request.params.session,
			});

			if (token && token.session != null && !token.fetched) {
				this.accessTokensRepository.update(token.id, {
					fetched: true,
				});

				return {
					ok: true,
					token: token.token,
					user: await this.userEntityService.pack(token.userId, null, { schema: 'UserDetailedNotMe' }),
				};
			} else {
				return {
					ok: false,
				};
			}
		});

		fastify.all('/clear-browser-cache', (request, reply) => {
			if (['GET', 'POST'].includes(request.method)) {
				reply.header('Clear-Site-Data', '"cache", "prefetchCache", "prerenderCache", "executionContexts"');
				reply.code(204);
				reply.send();
			} else {
				reply.code(405);
				reply.send(errorBody(httpErrors.methodNotAllowed));
			}
		});

		// /api以下の非2xxの応答は、すべて { error: { message, code, id, kind } } の形にする（P2-6）。
		// 未知のパスは、どのメソッドでも404にする。GETはルートのClientServerServiceの`/*`が先に一致して
		// HTMLを200で返してしまうので、/api以下にも`/*`を置く
		const unknownEndpoint = (request: unknown, reply: FastifyReply) => {
			reply.code(404);
			reply.send(errorBody(httpErrors.unknownEndpoint));
		};
		fastify.all('/*', unknownEndpoint);
		fastify.setNotFoundHandler(unknownEndpoint);

		// 本文の解析の失敗（JSONの構文、サイズ超過、Content-Type）など、エンドポイントの外で起きたエラー
		fastify.setErrorHandler<FastifyError>((error, request, reply) => {
			const status = typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
			if (status === 500) {
				this.apiLoggerService.logger.error(`Unhandled error in ${request.method} ${request.routeOptions.url ?? request.url}: ${error.message}`, {
					code: error.code,
					stack: error.stack,
				});
			}
			reply.code(status);
			reply.send(errorBody(status === 400 && error.code?.startsWith('FST_ERR_CTP_') ? httpErrors.invalidRequest : errorForStatus(status)));
		});

		// 本文を付けずに非2xxを返している箇所（サインアップなど）にも、ステータスに応じたエラーを付ける
		fastify.addHook('onSend', async (request, reply, payload) => {
			if (reply.statusCode < 400 || (payload != null && payload !== '')) return payload;
			reply.header('Content-Type', 'application/json; charset=utf-8');
			return JSON.stringify(errorBody(errorForStatus(reply.statusCode)));
		});

		done();
	}
}
