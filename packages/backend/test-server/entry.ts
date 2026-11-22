import { portToPid } from 'pid-port';
import fkill from 'fkill';
import Fastify from 'fastify';
import { NestFactory } from '@nestjs/core';
import { INestApplicationContext } from '@nestjs/common';
import { MainModule } from '@/MainModule.js';
import { ServerService } from '@/server/ServerService.js';
import { loadConfig, type Runtime } from '@/config.js';
import { NestLogger } from '@/NestLogger.js';
import type { FastifyInstance } from 'fastify';

const config = loadConfig();
// 環境変数は起動時に一度だけ読む（config.runtime）。テストのための抜け道は、/runtimeでconfig.runtime.testを書き換えて切り替える
if (config.runtime.nodeEnv !== 'test') throw new Error('The test server must run with NODE_ENV=test');
const originalTestOptions: Runtime['test'] = { ...config.runtime.test };

let app: INestApplicationContext;
let serverService: ServerService;
let controllerServer: FastifyInstance;

/**
 * テスト用のサーバインスタンスを起動する
 */
async function launch() {
	await killTestServer();

	console.log('starting application...');

	app = await NestFactory.createApplicationContext(MainModule, {
		logger: new NestLogger(),
	});
	serverService = app.get(ServerService);
	await serverService.launch();

	controllerServer = await startControllerEndpoints();

	// ジョブキューは必要な時にテストコード側で起動する
	// ジョブキューが動くとテスト結果の確認に支障が出ることがあるので意図的に動かさないでいる

	console.log('application initialized.');

	// Vitest の globalSetup は返り値の関数を teardown として呼ぶ。
	// これを返さないとテスト終了後もサーバが生き残ってプロセスが終了しない。
	return async () => {
		await controllerServer.close();
		await serverService.dispose();
		await app.close();
		await killTestServer();
	};
}

/**
 * 既に重複したポートで待ち受けしているサーバがある場合はkillする
 */
async function killTestServer() {
	//
	try {
		const pid = await portToPid(config.port);
		if (pid) {
			await fkill(pid, { force: true });
		}
	} catch {
		// NOP;
	}
}

/**
 * 別プロセスに切り離してしまったが故に出来なくなった、テスト用の振る舞いの切り替え等を実現するためのエンドポイントを作る。
 * サーバーのサービスはDIで同じconfigを受け取るので、config.runtime.testを書き換えると、次の要求から反映される
 * @param port
 */
async function startControllerEndpoints(port = config.port + 1000) {
	const fastify = Fastify();

	fastify.post<{ Body: { key?: string, value?: unknown } }>('/runtime', async (req, res) => {
		console.log(req.body);
		const { key, value } = req.body;
		const options: Record<string, unknown> = config.runtime.test;
		if (!key || !Object.hasOwn(options, key) || typeof value !== typeof options[key]) {
			res.code(400).send({ success: false });
			return;
		}

		options[key] = value;

		res.code(200).send({ success: true });
	});

	fastify.post('/runtime-reset', async (req, res) => {
		Object.assign(config.runtime.test, originalTestOptions);

		await serverService.dispose();
		await app.close();

		await killTestServer();

		console.log('starting application...');

		app = await NestFactory.createApplicationContext(MainModule, {
			logger: new NestLogger(),
		});
		serverService = app.get(ServerService);
		await serverService.launch();

		res.code(200).send({ success: true });
	});

	await fastify.listen({ port: port, host: 'localhost' });

	return fastify;
}

export default launch;
