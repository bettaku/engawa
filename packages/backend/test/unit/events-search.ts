/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { DataSource } from 'typeorm';
import EventsSearch, { meta } from '@/server/api/endpoints/notes/events/search.js';
import { entities } from '@/postgres.js';
import { MiNote } from '@/models/Note.js';
import type { NotesRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import type { QueryService } from '@/core/QueryService.js';
import type { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import type { RoleService } from '@/core/RoleService.js';

describe('notes/events/search', () => {
	let dataSource: DataSource;

	beforeAll(async () => {
		// DBには接続せず、実際のエンティティ定義からSQLだけを組み立てる
		dataSource = new DataSource({ type: 'postgres', entities });
		await (dataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
	});

	function fixture() {
		const captured: { sql: string, parameters: unknown[] }[] = [];
		const notesRepository = {
			queryRunner: undefined,
			createQueryBuilder: (alias: string) => {
				const qb = dataSource.getRepository(MiNote).createQueryBuilder(alias);
				qb.getMany = async () => {
					const [sql, parameters] = qb.getQueryAndParameters();
					captured.push({ sql, parameters });
					return [];
				};
				return qb;
			},
		} as unknown as NotesRepository;
		const queryService = {
			makePaginationQuery: (q: unknown) => q,
			generateVisibilityQuery: () => {},
			generateBaseNoteFilteringQuery: () => {},
		} as unknown as QueryService;
		const endpoint = new EventsSearch(
			{} as Config,
			notesRepository,
			{ packMany: async () => [] } as unknown as NoteEntityService,
			queryService,
			{ getUserPolicies: async () => ({ canSearchNotes: true }) } as unknown as RoleService,
		);
		const search = (params: Record<string, unknown>) => endpoint.exec(params, null, null, null);
		return { captured, search };
	}

	test('is rate limited because it is reachable without credentials', () => {
		expect(meta.requireCredential).toBe(false);
		expect(meta.limit).toEqual({ duration: 60 * 1000, max: 60 });
	});

	test('filter values are matched literally, never as a regular expression', async () => {
		const { captured, search } = fixture();
		const evil = '(a+)+$';
		await search({ filters: [{ key: ['location'], values: [evil, '100%_\\'] }] });

		expect(captured).toHaveLength(1);
		const { sql, parameters } = captured[0];
		expect(sql).not.toMatch(/~\*?/);
		expect(sql).not.toContain('MAX_EXECUTION_TIME');
		expect(sql).toMatch(/"event"\."metadata" #>> \$\d+ ILIKE \$\d+ OR "event"\."metadata" #>> \$\d+ ILIKE \$\d+/);
		expect(parameters).toContain('{location}');
		expect(parameters).toContain(`%${evil}%`);
		// LIKEのワイルドカードも文字として扱う
		expect(parameters).toContain('%100\\%\\_\\\\%');
	});

	test('each filter gets its own parameters', async () => {
		const { captured, search } = fixture();
		await search({ filters: [
			{ key: ['location'], values: ['tokyo'] },
			{ key: ['offers', 'price'], values: ['free', null] },
		] });

		const { sql, parameters } = captured[0];
		expect(parameters).toEqual(expect.arrayContaining(['{location}', '%tokyo%', '{offers,price}', '%free%']));
		expect(sql).toMatch(/\("event"\."metadata" #>> \$\d+\) IS NULL/);
	});

	test.each([
		['more than 10 filters', { filters: Array.from({ length: 11 }, () => ({ key: ['location'], values: ['a'] })) }],
		['more than 10 values', { filters: [{ key: ['location'], values: Array.from({ length: 11 }, () => 'a') }] }],
		['a value longer than 128 characters', { filters: [{ key: ['location'], values: ['a'.repeat(129)] }] }],
		['a key deeper than 5 levels', { filters: [{ key: ['a', 'b', 'c', 'd', 'e', 'f'], values: ['a'] }] }],
		['a key with special characters', { filters: [{ key: ['a}\'; --'], values: ['a'] }] }],
		['an empty key', { filters: [{ key: [], values: ['a'] }] }],
		['only blank values', { filters: [{ key: ['location'], values: ['  '] }] }],
	])('rejects %s', async (_, params) => {
		const { captured, search } = fixture();
		await expect(search(params)).rejects.toThrow();
		expect(captured).toHaveLength(0);
	});
});
