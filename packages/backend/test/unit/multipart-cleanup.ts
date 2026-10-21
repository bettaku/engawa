/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiCallService } from '@/server/api/ApiCallService.js';
import { AuthenticationError } from '@/server/api/AuthenticateService.js';
import { ApiError } from '@/server/api/error.js';

const temporary = vi.hoisted(() => ({ paths: [] as string[] }));
vi.mock('@/misc/create-temp.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/misc/create-temp.js')>();
	return {
		...actual,
		createTemp: async () => {
			const result = await actual.createTemp();
			temporary.paths.push(result[0]);
			return result;
		},
	};
});

afterEach(() => {
	for (const path of temporary.paths.splice(0)) {
		if (existsSync(path)) unlinkSync(path);
	}
});

function fixture() {
	const authenticate = vi.fn().mockResolvedValue([{ id: 'user' }, null, null]);
	const service = new ApiCallService(
		{ enableIpLogging: false } as never, {} as never, {} as never,
		{ authenticate } as never, {} as never, {} as never,
		{ logger: { error: vi.fn() } } as never,
	);
	// Exercise the real multipart owner; downstream authorization outcomes are
	// controlled so all early exits and asynchronous lifetimes can be covered.
	const call = vi.spyOn(service as never as { call: (...args: unknown[]) => Promise<unknown> }, 'call')
		.mockResolvedValue({ id: 'uploaded' });
	const reply = { code: vi.fn(), send: vi.fn(), header: vi.fn() };
	const file = Object.assign(Readable.from(['file contents']), { truncated: false });
	const multipart = { file, filename: 'file.txt', fields: { i: { value: 'app-token' } } };
	const request = { headers: {}, file: vi.fn().mockResolvedValue(multipart) };
	const run = async () => {
		try {
			await service.handleMultipartRequest({} as never, request as never, reply as never);
		} finally {
			service.dispose();
		}
	};
	return { authenticate, call, reply, multipart, request, run };
}

describe('multipart temporary file ownership', () => {
	test('keeps the file through an awaited successful endpoint, then removes it', async () => {
		const f = fixture();
		f.call.mockImplementation(async () => {
			await new Promise(resolve => setTimeout(resolve, 5));
			expect(readFileSync(temporary.paths[0], 'utf8')).toBe('file contents');
			return { id: 'uploaded' };
		});
		await f.run();
		expect(f.authenticate).toHaveBeenCalledWith('app-token');
		expect(f.reply.send).toHaveBeenCalledWith({ id: 'uploaded' });
		expect(existsSync(temporary.paths[0])).toBe(false);
	});

	test('cleans up rejected authentication', async () => {
		const f = fixture();
		f.authenticate.mockRejectedValue(new AuthenticationError('invalid token'));
		await f.run();
		expect(f.reply.code).toHaveBeenCalledWith(401);
		expect(f.call).not.toHaveBeenCalled();
		expect(existsSync(temporary.paths[0])).toBe(false);
	});

	test.each([401, 403, 429, 400, 500])('cleans up an API failure (%i)', async (status) => {
		const f = fixture();
		f.call.mockRejectedValue(new ApiError({ message: 'Rejected', code: 'REJECTED', id: 'test', httpStatusCode: status }));
		await f.run();
		expect(f.reply.code).toHaveBeenCalledWith(status);
		expect(existsSync(temporary.paths[0])).toBe(false);
	});

	test('cleans up malformed credentials before authentication', async () => {
		const f = fixture();
		f.multipart.fields.i.value = 42 as never;
		await f.run();
		expect(f.reply.code).toHaveBeenCalledWith(400);
		expect(f.reply.send).toHaveBeenCalled();
		expect(f.authenticate).not.toHaveBeenCalled();
		expect(existsSync(temporary.paths[0])).toBe(false);
	});

	test('cleans up truncated uploads', async () => {
		const f = fixture();
		f.multipart.file.truncated = true;
		await f.run();
		expect(f.reply.code).toHaveBeenCalledWith(413);
		expect(f.authenticate).not.toHaveBeenCalled();
		expect(existsSync(temporary.paths[0])).toBe(false);
	});

	test('cleans up a stream that fails after writing data', async () => {
		const f = fixture();
		f.multipart.file = Object.assign(Readable.from((async function* () {
			yield 'partial';
			throw new Error('connection aborted');
		})()), { truncated: false });
		await expect(f.run()).rejects.toThrow('connection aborted');
		expect(f.authenticate).not.toHaveBeenCalled();
		expect(existsSync(temporary.paths[0])).toBe(false);
	});

	test('tolerates endpoint-owned removal of the same file', async () => {
		const f = fixture();
		f.call.mockImplementation(async () => {
			unlinkSync(temporary.paths[0]);
		});
		await f.run();
		expect(existsSync(temporary.paths[0])).toBe(false);
	});
});
