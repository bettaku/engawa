/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import { NestFactory } from '@nestjs/core';
import { CommandModule } from '@/cli/CommandModule.js';
import { NestLogger } from '@/NestLogger.js';
import { CommandService } from '@/cli/CommandService.js';
import { QueueService } from '@/core/QueueService.js';
import { COUNTER_NAMES, CounterConsistencyService, type CounterName } from '@/core/CounterConsistencyService.js';

process.title = 'Engawa Cli';

Error.stackTraceLimit = Infinity;
EventEmitter.defaultMaxListeners = 128;

const command = process.argv[2] ?? 'help';

const isCounterCommand = command === 'check-counters' || command === 'repair-counters';

// カウンタのコマンドは、標準出力にレポート（JSON Lines）だけを出す。起動ログなどは標準エラー出力へ送る
if (isCounterCommand) {
	console.log = console.error;
	console.info = console.error;
	console.debug = console.error;
}

/** 標準出力への書き込みが終わるまで待つ（process.exitで書き込みが失われないようにする） */
function writeStdout(line: string): Promise<void> {
	return new Promise((resolve, reject) => {
		process.stdout.write(line + '\n', err => err ? reject(err) : resolve());
	});
}

const app = await NestFactory.createApplicationContext(CommandModule, {
	logger: new NestLogger(),
});

const commandService = app.get(CommandService);

switch (command) {
	case 'help': {
		console.log('Available commands:');
		console.log('  help - Displays this help message');
		console.log('  reset-captcha - Resets the captcha');
		console.log('  check-counters [counter...] - Checks denormalized counters (exits with 1 if any mismatch is found)');
		console.log('  repair-counters [counter...] - Recounts and repairs denormalized counters');
		console.log(`    counters: ${COUNTER_NAMES.join(', ')}`);
		console.log('    Checks and repairs are not synchronized with ordinary counter updates, so counters may still drift');
		console.log('    while notes, follows or clips are being written. For a reliable result, stop writes, wait for running');
		console.log('    jobs to finish, then repair and check again.');
		console.log('  bake-reactions - Applies buffered reactions to the database (stop the queue processes first)');
		console.log('  register-job-schedulers - Registers the repeatable system jobs (for queue processes started with CP_NO_JOB_SCHEDULERS)');
		break;
	}
	case 'check-counters':
	case 'repair-counters': {
		const counters = process.argv.slice(3);
		const unknown = counters.filter(c => !(COUNTER_NAMES as string[]).includes(c));
		if (unknown.length > 0) {
			console.error(`Unknown counters: ${unknown.join(', ')}`);
			console.error(`Available counters: ${COUNTER_NAMES.join(', ')}`);
			process.exit(1);
		}
		const service = app.get(CounterConsistencyService);
		const targets = counters.length > 0 ? counters as CounterName[] : COUNTER_NAMES;
		const reports = command === 'repair-counters' ? await service.repair(targets) : await service.check(targets);
		for (const report of reports) {
			await writeStdout(JSON.stringify(report));
		}
		if (command === 'check-counters' && reports.some(r => r.mismatched > 0)) process.exitCode = 1;
		break;
	}
	case 'ping': {
		await commandService.ping();
		break;
	}
	case 'reset-captcha': {
		await commandService.resetCaptcha();
		console.log('Captcha has been reset.');
		break;
	}
	case 'bake-reactions': {
		await commandService.bakeReactions();
		console.log('Buffered reactions have been baked.');
		break;
	}
	case 'register-job-schedulers': {
		const result = await app.get(QueueService).registerJobSchedulers();
		console.log(`Upserted: ${result.upserted.join(', ')}`);
		console.log(`Removed: ${result.removed.length > 0 ? result.removed.join(', ') : '(none)'}`);
		if (result.kept.length > 0) console.log(`Kept unknown schedulers: ${result.kept.join(', ')}`);
		break;
	}
	default: {
		console.error(`Unrecognized command: ${command}`);
		console.error('Use "help" to see available commands.');
		process.exit(1);
	}
}

// exitCodeを設定したコマンドは、その終了コードで終わる
process.exit(process.exitCode ?? 0);
