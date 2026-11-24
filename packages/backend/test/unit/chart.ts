/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { type Mocked } from 'vitest';
import * as lolex from '@sinonjs/fake-timers';
import { DataSource } from 'typeorm';
import type { AppLockService } from '@/core/AppLockService.js';
import TestChart from '@/core/chart/charts/test.js';
import TestGroupedChart from '@/core/chart/charts/test-grouped.js';
import TestUniqueChart from '@/core/chart/charts/test-unique.js';
import TestIntersectionChart from '@/core/chart/charts/test-intersection.js';
import { entity as TestChartEntity } from '@/core/chart/charts/entities/test.js';
import { entity as TestGroupedChartEntity } from '@/core/chart/charts/entities/test-grouped.js';
import { entity as TestUniqueChartEntity } from '@/core/chart/charts/entities/test-unique.js';
import { entity as TestIntersectionChartEntity } from '@/core/chart/charts/entities/test-intersection.js';
import { loadConfig } from '@/config.js';
import Logger from '@/logger.js';

// 偽のタイマーに置き換えられる前の、本物のsetImmediate（データベースの応答を待つため）
const realSetImmediate = globalThis.setImmediate;

describe('Chart', () => {
	const config = loadConfig();
	const appLockService = {
		getChartInsertLock: () => () => Promise.resolve(() => {}),
	} as unknown as Mocked<AppLockService>;

	let db: DataSource | undefined;

	let testChart: TestChart;
	let testGroupedChart: TestGroupedChart;
	let testUniqueChart: TestUniqueChart;
	let testIntersectionChart: TestIntersectionChart;
	let clock: lolex.InstalledClock;

	beforeEach(async () => {
		if (db) db.destroy();

		db = new DataSource({
			type: 'postgres',
			host: config.db.host,
			port: config.db.port,
			username: config.db.user,
			password: config.db.pass,
			database: config.db.db,
			extra: {
				statement_timeout: 1000 * 10,
				...config.db.extra,
			},
			synchronize: true,
			dropSchema: true,
			maxQueryExecutionTime: 300,
			entities: [
				TestChartEntity.hour, TestChartEntity.day,
				TestGroupedChartEntity.hour, TestGroupedChartEntity.day,
				TestUniqueChartEntity.hour, TestUniqueChartEntity.day,
				TestIntersectionChartEntity.hour, TestIntersectionChartEntity.day,
			],
			migrations: ['../../migration/*.js'],
		});

		await db.initialize();

		const logger = new Logger('chart'); // TODO: モックにする
		testChart = new TestChart(db, appLockService, logger);
		testGroupedChart = new TestGroupedChart(db, appLockService, logger);
		testUniqueChart = new TestUniqueChart(db, appLockService, logger);
		testIntersectionChart = new TestIntersectionChart(db, appLockService, logger);

		clock = lolex.install({
			now: new Date(Date.UTC(2000, 0, 1, 0, 0, 0)),
			shouldClearNativeTimers: true,
		});
	});

	afterEach(() => {
		clock.uninstall();
	});

	afterAll(async () => {
		if (db) await db.destroy();
	});

	test('Can updates', async () => {
		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});
	});

	test('Can updates (dec)', async () => {
		await testChart.decrement();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [1, 0, 0],
				inc: [0, 0, 0],
				total: [-1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [1, 0, 0],
				inc: [0, 0, 0],
				total: [-1, 0, 0],
			},
		});
	});

	test('Empty chart', async () => {
		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [0, 0, 0],
				total: [0, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [0, 0, 0],
				total: [0, 0, 0],
			},
		});
	});

	test('Can updates at multiple times at same time', async () => {
		await testChart.increment();
		await testChart.increment();
		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [3, 0, 0],
				total: [3, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [3, 0, 0],
				total: [3, 0, 0],
			},
		});
	});

	test('複数回saveされてもデータの更新は一度だけ', async () => {
		await testChart.increment();
		await testChart.save();
		await testChart.save();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});
	});

	test('Can updates at different times', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick('01:00:00');

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 1, 0],
				total: [2, 1, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	// 仕様上はこうなってほしいけど、実装は難しそうなのでskip
	/*
	test('Can updates at different times without save', async () => {
		await testChart.increment();

		clock.tick('01:00:00');

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 1, 0],
				total: [2, 1, 0]
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0]
			},
		});
	});
	*/

	test('Can padding', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick('02:00:00');

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 1],
				total: [2, 1, 1],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	// 要求された範囲にログがひとつもない場合でもパディングできる
	test('Can padding from past range', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick('05:00:00');

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [0, 0, 0],
				total: [1, 1, 1],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});
	});

	// 要求された範囲の最も古い箇所に位置するログが存在しない場合でもパディングできる
	// Issue #3190
	test('Can padding from past range 2', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick('05:00:00');

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [2, 1, 1],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	test('Can specify offset', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick('01:00:00');

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));
		const chartDays = await testChart.getChart('day', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	test('Can specify offset (floor time)', async () => {
		clock.tick('00:30:00');

		await testChart.increment();
		await testChart.save();

		clock.tick('01:30:00');

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));
		const chartDays = await testChart.getChart('day', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	describe('Grouped', () => {
		test('Can updates', async () => {
			await testGroupedChart.increment('alice');
			await testGroupedChart.save();

			const aliceChartHours = await testGroupedChart.getChart('hour', 3, null, 'alice');
			const aliceChartDays = await testGroupedChart.getChart('day', 3, null, 'alice');
			const bobChartHours = await testGroupedChart.getChart('hour', 3, null, 'bob');
			const bobChartDays = await testGroupedChart.getChart('day', 3, null, 'bob');

			assert.deepStrictEqual(aliceChartHours, {
				foo: {
					dec: [0, 0, 0],
					inc: [1, 0, 0],
					total: [1, 0, 0],
				},
			});

			assert.deepStrictEqual(aliceChartDays, {
				foo: {
					dec: [0, 0, 0],
					inc: [1, 0, 0],
					total: [1, 0, 0],
				},
			});

			assert.deepStrictEqual(bobChartHours, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [0, 0, 0],
				},
			});

			assert.deepStrictEqual(bobChartDays, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [0, 0, 0],
				},
			});
		});
	});

	describe('Unique increment', () => {
		test('Can updates', async () => {
			await testUniqueChart.uniqueIncrement('alice');
			await testUniqueChart.uniqueIncrement('alice');
			await testUniqueChart.uniqueIncrement('bob');
			await testUniqueChart.save();

			const chartHours = await testUniqueChart.getChart('hour', 3, null);
			const chartDays = await testUniqueChart.getChart('day', 3, null);

			assert.deepStrictEqual(chartHours, {
				foo: [2, 0, 0],
			});

			assert.deepStrictEqual(chartDays, {
				foo: [2, 0, 0],
			});
		});

		test('引用符や括弧を含む値も、1つの値としてそのまま保存される', async () => {
			await testUniqueChart.uniqueIncrement('\'}\'::varchar[]) || (SELECT pg_sleep(10))::text || (\'{');
			await testUniqueChart.uniqueIncrement('"a","b"');
			await testUniqueChart.uniqueIncrement('back\\slash');
			await testUniqueChart.save();

			const chartHours = await testUniqueChart.getChart('hour', 3, null);

			assert.deepStrictEqual(chartHours, {
				foo: [3, 0, 0],
			});
		});

		describe('Intersection', () => {
			test('条件が満たされていない場合はカウントされない', async () => {
				await testIntersectionChart.addA('alice');
				await testIntersectionChart.addA('bob');
				await testIntersectionChart.addB('carol');
				await testIntersectionChart.save();

				const chartHours = await testIntersectionChart.getChart('hour', 3, null);
				const chartDays = await testIntersectionChart.getChart('day', 3, null);

				assert.deepStrictEqual(chartHours, {
					a: [2, 0, 0],
					b: [1, 0, 0],
					aAndB: [0, 0, 0],
				});

				assert.deepStrictEqual(chartDays, {
					a: [2, 0, 0],
					b: [1, 0, 0],
					aAndB: [0, 0, 0],
				});
			});

			test('条件が満たされている場合にカウントされる', async () => {
				await testIntersectionChart.addA('alice');
				await testIntersectionChart.addA('bob');
				await testIntersectionChart.addB('carol');
				await testIntersectionChart.addB('alice');
				await testIntersectionChart.save();

				const chartHours = await testIntersectionChart.getChart('hour', 3, null);
				const chartDays = await testIntersectionChart.getChart('day', 3, null);

				assert.deepStrictEqual(chartHours, {
					a: [2, 0, 0],
					b: [2, 0, 0],
					aAndB: [1, 0, 0],
				});

				assert.deepStrictEqual(chartDays, {
					a: [2, 0, 0],
					b: [2, 0, 0],
					aAndB: [1, 0, 0],
				});
			});
		});
	});

	describe('Resync', () => {
		test('Can resync', async () => {
			testChart.total = 1;

			await testChart.resync();

			const chartHours = await testChart.getChart('hour', 3, null);
			const chartDays = await testChart.getChart('day', 3, null);

			assert.deepStrictEqual(chartHours, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [1, 0, 0],
				},
			});

			assert.deepStrictEqual(chartDays, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [1, 0, 0],
				},
			});
		});

		test('Can resync (2)', async () => {
			await testChart.increment();
			await testChart.save();

			clock.tick('01:00:00');

			testChart.total = 100;

			await testChart.resync();

			const chartHours = await testChart.getChart('hour', 3, null);
			const chartDays = await testChart.getChart('day', 3, null);

			assert.deepStrictEqual(chartHours, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 1, 0],
					total: [100, 1, 0],
				},
			});

			assert.deepStrictEqual(chartDays, {
				foo: {
					dec: [0, 0, 0],
					inc: [1, 0, 0],
					total: [100, 0, 0],
				},
			});
		});
	});

	describe('保存', () => {
		/** データベースへの保存（新しいログの作成）を、テストが解放するまで止めるチャート */
		function createBlockedChart(failFirst = false) {
			let release: () => void = () => {};
			const released = new Promise<void>(resolve => release = resolve);
			let notifyRequested: () => void = () => {};
			const requested = new Promise<void>(resolve => notifyRequested = resolve);
			let calls = 0;
			const lockService = {
				getChartInsertLock: async () => {
					calls++;
					if (failFirst && calls === 1) throw new Error('db is down');
					notifyRequested();
					await released;
					return () => {};
				},
			} as unknown as Mocked<AppLockService>;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const chart = new TestChart(db!, lockService, new Logger('chart'));
			return { chart, requested, release };
		}

		async function totalOf(chart: TestChart) {
			const chartHours = await chart.getChart('hour', 1, null);
			return chartHours.foo.total[0];
		}

		test('同時に保存しても、同じ差分を二重に足さない', async () => {
			await testChart.increment();
			await Promise.all([testChart.save(), testChart.save()]);

			assert.strictEqual(await totalOf(testChart), 1);
		});

		test('保存中に追加された差分を消さず、次の保存で足す', async () => {
			const { chart, requested, release } = createBlockedChart();
			await chart.increment();
			const saving = chart.save();
			await requested;

			await chart.increment();
			release();
			await saving;
			assert.strictEqual(await totalOf(chart), 1);

			await chart.save();
			assert.strictEqual(await totalOf(chart), 2);
		});

		test('waitForSaveは、それまでの差分がデータベースに保存されてから解決する', async () => {
			await testChart.increment();
			await testChart.waitForSave();

			assert.strictEqual(await totalOf(testChart), 1);
		});

		test('waitForSaveで待っている差分の保存に失敗したら、保存し直してから解決する', async () => {
			const { chart, release } = createBlockedChart(true);
			release();
			await chart.increment();
			let resolved = false;
			const waiting = chart.waitForSave().then(() => resolved = true);

			// 最初の保存は失敗し、差分はバッファに戻って、保存し直しが予約される
			while (chart['saveRetryTimer'] == null) {
				await new Promise(resolve => realSetImmediate(resolve));
			}
			assert.strictEqual(resolved, false);

			// 保存し直しの時刻まで進める（保存し直しが予約されていれば、その時刻まで進め続ける）
			for (let i = 0; i < 10 && !resolved; i++) {
				await clock.tickAsync(1000 * 10);
				while (!resolved && chart['saveRetryTimer'] == null && chart['saveScheduled']) {
					await new Promise(resolve => realSetImmediate(resolve));
				}
				await new Promise(resolve => realSetImmediate(resolve));
			}
			await waiting;
			assert.strictEqual(await totalOf(chart), 1);
		});
	});
});
