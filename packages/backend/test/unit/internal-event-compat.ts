/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import type {
	AntennasRepository,
	MiAntenna,
	MiMeta,
	MiSystemWebhook,
	MiWebhook,
	MiUser,
	MetasRepository,
	RoleAssignmentsRepository,
	RolesRepository,
	SystemWebhooksRepository,
	UsersRepository,
	WebhooksRepository,
} from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import {
	GlobalEventService,
	isInternalEventRef,
	toInternalEventRef,
	toMetaUpdatedEventRef,
	toRoleAssignmentEventRef,
} from '@/core/GlobalEventService.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { UserWebhookService } from '@/core/UserWebhookService.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { AntennaService } from '@/core/AntennaService.js';
import { MetaService } from '@/core/MetaService.js';
import { SYSTEM_ACCOUNT_TYPES, SystemAccountService } from '@/core/SystemAccountService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

async function waitFor(condition: () => Promise<boolean> | boolean, timeout = 5000) {
	const start = Date.now();
	while (!(await condition())) {
		if (Date.now() - start > timeout) throw new Error('timed out');
		await new Promise(r => setTimeout(r, 20));
	}
}

describe('内部イベントの新本文（P2-3 第1リリース）', () => {
	let app: TestingModule;
	let globalEventService: GlobalEventService;
	let idService: IdService;
	let usersRepository: UsersRepository;
	let rolesRepository: RolesRepository;
	let roleAssignmentsRepository: RoleAssignmentsRepository;
	let webhooksRepository: WebhooksRepository;
	let systemWebhooksRepository: SystemWebhooksRepository;
	let antennasRepository: AntennasRepository;
	let metasRepository: MetasRepository;
	let alice: MiUser;

	beforeAll(async () => {
		app = await Test.createTestingModule({ imports: [GlobalModule, CoreModule] }).compile();
		app.enableShutdownHooks();
		await app.init();

		globalEventService = app.get(GlobalEventService);
		idService = app.get(IdService);
		usersRepository = app.get(DI.usersRepository);
		rolesRepository = app.get(DI.rolesRepository);
		roleAssignmentsRepository = app.get(DI.roleAssignmentsRepository);
		webhooksRepository = app.get(DI.webhooksRepository);
		systemWebhooksRepository = app.get(DI.systemWebhooksRepository);
		antennasRepository = app.get(DI.antennasRepository);
		metasRepository = app.get(DI.metasRepository);

		const id = idService.gen();
		const un = secureRndstr(16);
		await usersRepository.insert({ id, username: un, usernameLower: un.toLowerCase(), host: null });
		alice = await usersRepository.findOneByOrFail({ id });
	});

	afterAll(async () => {
		await roleAssignmentsRepository.delete({ userId: alice.id });
		await rolesRepository.createQueryBuilder().delete().execute();
		await webhooksRepository.delete({ userId: alice.id });
		await systemWebhooksRepository.createQueryBuilder().delete().execute();
		await antennasRepository.delete({ userId: alice.id });
		await usersRepository.delete({ id: alice.id });
		await app.close();
	});

	async function createRole(name: string) {
		const id = idService.gen();
		await rolesRepository.insert({
			id,
			name,
			description: '',
			updatedAt: new Date(),
			lastUsedAt: new Date(),
			target: 'manual',
			condFormula: {},
			policies: {},
		});
		return await rolesRepository.findOneByOrFail({ id });
	}

	describe('本文の判定と生成', () => {
		test('旧本文は新本文と判定しない', () => {
			expect(isInternalEventRef({ id: 'x', name: 'role' })).toBe(false);
			expect(isInternalEventRef(toInternalEventRef({ id: 'x' }))).toBe(true);
		});

		test('toRoleAssignmentEventRefは、受信側が使うuserIdとroleIdだけを持つ', () => {
			expect(toRoleAssignmentEventRef({ id: 'a', userId: 'u', roleId: 'r', expiresAt: null } as never))
				.toEqual({ v: 2, id: 'a', userId: 'u', roleId: 'r' });
		});

		test('toMetaUpdatedEventRefは、変わった列の名前だけを持つ', () => {
			const before = { name: 'a', description: 'x', policies: { a: 1 } } as Partial<MiMeta>;
			const after = { name: 'b', description: 'x', policies: { a: 2 } } as Partial<MiMeta>;
			expect(toMetaUpdatedEventRef(before, after)).toEqual({ v: 2, changedKeys: ['name', 'policies'] });
			expect(toMetaUpdatedEventRef(undefined, after).changedKeys.sort()).toEqual(['description', 'name', 'policies']);
		});
	});

	describe('ロール', () => {
		test('新本文のroleCreated・roleUpdatedでは、DBから読み直す', async () => {
			const roleService = app.get(RoleService);
			await roleService.getRoles(); // キャッシュに載せる

			const role = await createRole('created');
			globalEventService.publishInternalEvent('roleCreated', toInternalEventRef(role));
			await waitFor(async () => (await roleService.getRoles()).some(r => r.id === role.id));

			await rolesRepository.update(role.id, { name: 'updated' });
			globalEventService.publishInternalEvent('roleUpdated', toInternalEventRef(role));
			await waitFor(async () => (await roleService.getRoles()).find(r => r.id === role.id)?.name === 'updated');

			await rolesRepository.delete(role.id);
			globalEventService.publishInternalEvent('roleDeleted', toInternalEventRef(role));
			await waitFor(async () => !(await roleService.getRoles()).some(r => r.id === role.id));
		});

		test('旧本文のroleUpdatedも、これまでどおり処理する', async () => {
			const roleService = app.get(RoleService);
			const role = await createRole('old-body');
			await roleService.getRoles();
			globalEventService.publishInternalEvent('roleCreated', role);
			await waitFor(async () => (await roleService.getRoles()).some(r => r.id === role.id));

			globalEventService.publishInternalEvent('roleUpdated', { ...role, name: 'old-body-updated' });
			await waitFor(async () => (await roleService.getRoles()).find(r => r.id === role.id)?.name === 'old-body-updated');
		});

		test('新本文のuserRoleAssigned・userRoleUnassignedで、ユーザーの割り当てを更新する', async () => {
			const roleService = app.get(RoleService);
			const role = await createRole('assigned');
			expect(await roleService.getUserAssigns(alice.id)).toEqual([]);

			const assignmentId = idService.gen();
			await roleAssignmentsRepository.insert({ id: assignmentId, userId: alice.id, roleId: role.id });
			const assignment = await roleAssignmentsRepository.findOneByOrFail({ id: assignmentId });
			globalEventService.publishInternalEvent('userRoleAssigned', toRoleAssignmentEventRef(assignment));
			await waitFor(async () => (await roleService.getUserAssigns(alice.id)).some(a => a.id === assignmentId));

			await roleAssignmentsRepository.delete(assignmentId);
			globalEventService.publishInternalEvent('userRoleUnassigned', toRoleAssignmentEventRef(assignment));
			await waitFor(async () => !(await roleService.getUserAssigns(alice.id)).some(a => a.id === assignmentId));
		});
	});

	describe('Webhook', () => {
		test('新本文で、有効なユーザーWebhookの一覧をDBから読み直す', async () => {
			const service = app.get(UserWebhookService);
			await service.getActiveWebhooks();

			const id = idService.gen();
			await webhooksRepository.insert({ id, userId: alice.id, name: 'hook', on: ['note'], url: 'https://example.com', secret: 'secret', active: true });
			globalEventService.publishInternalEvent('webhookCreated', toInternalEventRef({ id } as MiWebhook));
			await waitFor(async () => (await service.getActiveWebhooks()).some(w => w.id === id));

			await webhooksRepository.update(id, { active: false });
			globalEventService.publishInternalEvent('webhookUpdated', toInternalEventRef({ id } as MiWebhook));
			await waitFor(async () => !(await service.getActiveWebhooks()).some(w => w.id === id));

			await webhooksRepository.update(id, { active: true });
			globalEventService.publishInternalEvent('webhookUpdated', toInternalEventRef({ id } as MiWebhook));
			await waitFor(async () => (await service.getActiveWebhooks()).some(w => w.id === id));

			await webhooksRepository.delete(id);
			globalEventService.publishInternalEvent('webhookDeleted', toInternalEventRef({ id } as MiWebhook));
			await waitFor(async () => !(await service.getActiveWebhooks()).some(w => w.id === id));
		});

		test('新本文で、有効なシステムWebhookの一覧をDBから読み直す', async () => {
			const service = app.get(SystemWebhookService);
			await service.fetchActiveSystemWebhooks();

			const id = idService.gen();
			await systemWebhooksRepository.insert({ id, name: 'hook', on: ['abuseReport'], url: 'https://example.com', secret: 'secret', isActive: true, updatedAt: new Date() });
			globalEventService.publishInternalEvent('systemWebhookCreated', toInternalEventRef({ id } as MiSystemWebhook));
			await waitFor(async () => (await service.fetchActiveSystemWebhooks()).some(w => w.id === id));

			await systemWebhooksRepository.update(id, { isActive: false });
			globalEventService.publishInternalEvent('systemWebhookUpdated', toInternalEventRef({ id } as MiSystemWebhook));
			await waitFor(async () => !(await service.fetchActiveSystemWebhooks()).some(w => w.id === id));

			// 一覧に載った状態から削除する（載っていなければ、削除の処理がなくても成り立つので）
			await systemWebhooksRepository.update(id, { isActive: true });
			globalEventService.publishInternalEvent('systemWebhookUpdated', toInternalEventRef({ id } as MiSystemWebhook));
			await waitFor(async () => (await service.fetchActiveSystemWebhooks()).some(w => w.id === id));

			await systemWebhooksRepository.delete(id);
			globalEventService.publishInternalEvent('systemWebhookDeleted', toInternalEventRef({ id } as MiSystemWebhook));
			await waitFor(async () => !(await service.fetchActiveSystemWebhooks()).some(w => w.id === id));
		});
	});

	describe('アンテナ', () => {
		test('新本文で、有効なアンテナの一覧をDBから読み直す。無効なアンテナは加えない', async () => {
			const service = app.get(AntennaService);
			await service.getAntennas();

			const id = idService.gen();
			await antennasRepository.insert({ id, userId: alice.id, name: 'antenna', src: 'all', keywords: [['a']], excludeKeywords: [], users: [], isActive: false, withFile: false, lastUsedAt: new Date() });
			// 自分のプロセスに届いて一覧が捨てられるのを待ってから、無効なアンテナが一覧にないことを確かめる
			const generation = () => (service as unknown as { antennasGeneration: number }).antennasGeneration;
			const before = generation();
			globalEventService.publishInternalEvent('antennaCreated', toInternalEventRef({ id } as MiAntenna));
			await waitFor(() => generation() !== before);
			expect((await service.getAntennas()).some(a => a.id === id)).toBe(false);

			await antennasRepository.update(id, { isActive: true, name: 'activated' });
			globalEventService.publishInternalEvent('antennaUpdated', toInternalEventRef({ id } as MiAntenna));
			await waitFor(async () => (await service.getAntennas()).find(a => a.id === id)?.name === 'activated');
			expect((await service.getAntennas()).filter(a => a.id === id)).toHaveLength(1);

			await antennasRepository.delete(id);
			globalEventService.publishInternalEvent('antennaDeleted', toInternalEventRef({ id } as MiAntenna));
			await waitFor(async () => !(await service.getAntennas()).some(a => a.id === id));
		});

		test('一覧の取得中に新本文が届いたら、取得した一覧（古いかもしれない）を保存しない', async () => {
			const service = app.get(AntennaService);
			const id = idService.gen();
			await antennasRepository.insert({ id, userId: alice.id, name: 'antenna', src: 'all', keywords: [['a']], excludeKeywords: [], users: [], isActive: true, withFile: false, lastUsedAt: new Date() });
			globalEventService.publishInternalEvent('antennaCreated', toInternalEventRef({ id } as MiAntenna));
			await waitFor(async () => (await service.getAntennas()).some(a => a.id === id));

			// 一覧を捨てた状態で取得を始め、削除前の行を読んだところで止める
			(service as unknown as { invalidateAntennas: () => void }).invalidateAntennas();
			const findBy = antennasRepository.findBy.bind(antennasRepository);
			let release!: () => void;
			const released = new Promise<void>(r => { release = r; });
			let markRead!: () => void;
			const readDone = new Promise<void>(r => { markRead = r; });
			const spy = vi.spyOn(antennasRepository, 'findBy').mockImplementationOnce(async (where) => {
				const rows = await findBy(where);
				markRead();
				await released;
				return rows;
			});
			try {
				const fetching = service.getAntennas();
				// 削除前の行を読み終えてから削除する
				await readDone;

				// 自分のプロセスにも届くのを待つ。届いたら一覧の世代が進む
				const generation = () => (service as unknown as { antennasGeneration: number }).antennasGeneration;
				const before = generation();
				await antennasRepository.delete(id);
				globalEventService.publishInternalEvent('antennaDeleted', toInternalEventRef({ id } as MiAntenna));
				await waitFor(() => generation() !== before);
				release();

				expect((await fetching).some(a => a.id === id)).toBe(true);
				expect((await service.getAntennas()).some(a => a.id === id)).toBe(false);
			} finally {
				// 失敗したときも、止めている取得を終わらせる
				release();
				spy.mockRestore();
			}
		});
	});

	describe('metaUpdated', () => {
		let original: Pick<MiMeta, 'name' | 'description'>;

		beforeAll(async () => {
			const meta = await metasRepository.findOneByOrFail({ id: app.get<MiMeta>(DI.meta).id });
			original = { name: meta.name, description: meta.description };
		});

		afterAll(async () => {
			await metasRepository.update(app.get<MiMeta>(DI.meta).id, original);
		});

		test('新本文では、注入済みのmetaとMetaServiceのキャッシュをDBから読み直す', async () => {
			const meta = app.get<MiMeta>(DI.meta);
			const metaService = app.get(MetaService);
			await metaService.fetch();

			const description = `description-${secureRndstr(8)}`;
			await metasRepository.update(meta.id, { description });
			globalEventService.publishInternalEvent('metaUpdated', { v: 2, changedKeys: ['description'] });

			await waitFor(() => meta.description === description);
			await waitFor(async () => (await metaService.fetch()).description === description);
		});

		test('新本文で名前が変わったときだけ、システムアカウントの名前を更新する', async () => {
			const meta = app.get<MiMeta>(DI.meta);
			const systemAccountService = app.get(SystemAccountService);
			// イベントの処理がアカウントを作り始めないように、すべてのシステムアカウントを先に作っておく
			const accounts = await Promise.all(SYSTEM_ACCOUNT_TYPES.map(type => systemAccountService.fetch(type)));
			const actor = accounts[0];

			const name = `name-${secureRndstr(8)}`;
			await metasRepository.update(meta.id, { name });

			globalEventService.publishInternalEvent('metaUpdated', { v: 2, changedKeys: ['description'] });
			await new Promise(r => setTimeout(r, 300));
			expect((await usersRepository.findOneByOrFail({ id: actor.id })).name).not.toBe(name);

			globalEventService.publishInternalEvent('metaUpdated', { v: 2, changedKeys: ['name'] });
			// すべてのアカウントの更新を待つ。途中でテストを終えると、アプリを閉じた後に処理が続く
			for (const account of accounts) {
				await waitFor(async () => (await usersRepository.findOneByOrFail({ id: account.id })).name === name);
			}
		});
	});
});
