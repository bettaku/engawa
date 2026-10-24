---
title: Backend notes
description: Things to watch out for with NestJS, TypeORM, SQL and migrations
lastUpdated: 2026-10-24
sidebar:
  order: 4
---

Things to keep in mind when writing backend code (`packages/backend`).

## TypeORM

### Use `insert`, not `save`, for INSERT

`save` issues a SELECT internally. If you only need to create a record, use `insert`.

### Conditions on "not `null`"

```ts
const foo = await Foos.findOne({
	bar: Not(null),
});
```

does not work as "`bar` is not `null`". Use `IsNull()` instead.

```ts
const foo = await Foos.findOne({
	bar: Not(IsNull()),
});
```

### Don't pass an empty array to `IN`

```ts
const users = await Users.find({
	id: In(userIds),
});
```

If `userIds` is `[]`, this issues `user.id IN ()`, which is invalid SQL. If the array can be empty, check its length first.

```ts
const users = userIds.length > 0 ? await Users.find({
	id: In(userIds),
}) : [];
```

## SQL and the query builder

### Don't reuse placeholder names

When building SQL with the query builder, don't use the same placeholder name more than once.

```ts
query.andWhere(new Brackets(qb => {
	for (const type of ps.fileType) {
		qb.orWhere(':type = ANY(note.attachedFileTypes)', { type: type });
	}
}));
```

uses `type` several times in the loop, which breaks the query. Number the names to keep them apart.

```ts
query.andWhere(new Brackets(qb => {
	for (const type of ps.fileType) {
		const i = ps.fileType.indexOf(type);
		qb.orWhere(`:type${i} = ANY(note.attachedFileTypes)`, { [`type${i}`]: type });
	}
}));
```

### Branch the SQL when a parameter can be `null`

```ts
query.where('file.folderId = :folderId', { folderId: ps.folderId });
```

If `ps.folderId` is `null`, this becomes `file.folderId = null`, which is not correct SQL and does not return the expected result.

```ts
if (ps.folderId) {
	query.where('file.folderId = :folderId', { folderId: ps.folderId });
} else {
	query.where('file.folderId IS NULL');
}
```

### `IN` on a column that can contain `null`

`IN` never matches `null`. Handle `null` separately, for example with `OR`.

### Array indexes start at 1

Array indexes in SQL are **1-based**. To get `a` from `[a, b, c]`, write `[1]`, not `[0]`.

## Migrations

### Creating one

Run this in `packages/backend`.

```bash
pnpm typeorm migration:generate -d ormconfig.js -o --esm migration/MigrationName
```

The generated file may contain unnecessary changes. Keep only what you need.

Migrations run on every startup until applied, so if one rewrites a large table, keep the load down, for example by narrowing the rows it touches.

### Be careful when removing enum values

To remove an enum value, every record with that value must be deleted. If that is too heavy or impossible, leave the value in place.

## NestJS

### Circular dependencies between services

First, try `forwardRef`.

```ts
export class FooService {
	constructor(
		@Inject(forwardRef(() => BarService))
		private barService: BarService,
	) {
	}
}
```

If that doesn't help, use `OnModuleInit` and `ModuleRef`.

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { BarService } from '@/core/BarService';

@Injectable()
export class FooService implements OnModuleInit {
	private barService: BarService; // moved out of the constructor

	constructor(
		private moduleRef: ModuleRef,
	) {
	}

	async onModuleInit() {
		this.barService = this.moduleRef.get(BarService.name);
	}

	public async niceMethod() {
		return await this.barService.incredibleMethod({ hoge: 'fuga' });
	}
}
```

In that case, unit tests need to call `onModuleInit` themselves.

```ts
describe('test', () => {
	let app: TestingModule;
	let fooService: FooService;
	let barService: BarService;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: ...,
			providers: [
				FooService,
				{ // mock it (optional)
					provide: BarService,
					useFactory: () => ({
						incredibleMethod: vi.fn(),
					}),
				},
				{ // make it available by name
					provide: BarService.name,
					useExisting: BarService,
				},
			],
		})
			.useMocker(...)
			.compile();

		fooService = app.get<FooService>(FooService);
		barService = app.get<BarService>(BarService) as Mocked<BarService>;

		// run onModuleInit
		await fooService.onModuleInit();
	});

	test('nice', async () => {
		await fooService.niceMethod();

		expect(barService.incredibleMethod).toHaveBeenCalled();
		expect(barService.incredibleMethod.mock.lastCall![0])
			.toEqual({ hoge: 'fuga' });
	});
});
```

## ActivityPub extension properties

The rules for adding your own properties to ActivityPub payloads are in [ActivityPub payload changes in CONTRIBUTING.md](https://github.com/bettaku/engawa/blob/develop/CONTRIBUTING.md#activitypub-payload-changes). In short:

- Prefix the name with `_misskey_` (e.g. `_misskey_quote`).
- Declare it as **optional** in `packages/backend/src/core/activitypub/type.ts`.
- Add it to the context definition in `packages/backend/src/core/activitypub/misc/contexts.ts`.
