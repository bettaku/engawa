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
import { COUNTER_NAMES, CounterConsistencyService, type CounterName } from '@/core/CounterConsistencyService.js';

process.title = 'Engawa Cli';

Error.stackTraceLimit = Infinity;
EventEmitter.defaultMaxListeners = 128;

const app = await NestFactory.createApplicationContext(CommandModule, {
	logger: new NestLogger(),
});

const commandService = app.get(CommandService);

const command = process.argv[2] ?? 'help';

switch (command) {
	case 'help': {
		console.log('Available commands:');
		console.log('  help - Displays this help message');
		console.log('  reset-captcha - Resets the captcha');
		console.log('  check-counters [counter...] - Checks denormalized counters (exits with 1 if any mismatch is found)');
		console.log('  repair-counters [counter...] - Recounts and repairs denormalized counters');
		console.log(`    counters: ${COUNTER_NAMES.join(', ')}`);
		console.log('  bake-reactions - Applies buffered reactions to the database (stop the queue processes first)');
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
			console.log(JSON.stringify(report));
		}
		if (command === 'check-counters' && reports.some(r => r.mismatched > 0)) process.exit(1);
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
	default: {
		console.error(`Unrecognized command: ${command}`);
		console.error('Use "help" to see available commands.');
		process.exit(1);
	}
}

process.exit(0);
