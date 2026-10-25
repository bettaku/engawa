---
title: バックエンドの注意点
description: NestJS・TypeORM・SQL・マイグレーションで気をつけること
lastUpdated: 2026-10-24
sidebar:
  order: 4
---

バックエンド（`packages/backend`）のコードを書くときに気をつけることをまとめています。

## TypeORM

### INSERTには `save` ではなく `insert` を使う

`save` は内部でSELECTを発行します。新しいレコードを作るだけなら `insert` を使ってください。

### `null` でないことを条件にする

```ts
const foo = await Foos.findOne({
	bar: Not(null),
});
```

のように書いても、「`bar` が `null` ではない」という条件として期待どおりには動きません。次のように `IsNull()` を使います。

```ts
const foo = await Foos.findOne({
	bar: Not(IsNull()),
});
```

### `IN` に空の配列を渡さない

```ts
const users = await Users.find({
	id: In(userIds),
});
```

で `userIds` が `[]` だと、`user.id IN ()` という不正なSQLが発行されます。空になりうる場合は、先に長さを確認します。

```ts
const users = userIds.length > 0 ? await Users.find({
	id: In(userIds),
}) : [];
```

## SQLとクエリビルダー

### プレースホルダーの名前を重複させない

クエリビルダーでSQLを組み立てるとき、同じプレースホルダーの名前を複数回使ってはいけません。

```ts
query.andWhere(new Brackets(qb => {
	for (const type of ps.fileType) {
		qb.orWhere(':type = ANY(note.attachedFileTypes)', { type: type });
	}
}));
```

と書くと、ループの中で `type` が何度も使われて、おかしくなります。次のように、名前に番号を付けて分けます。

```ts
query.andWhere(new Brackets(qb => {
	for (const type of ps.fileType) {
		const i = ps.fileType.indexOf(type);
		qb.orWhere(`:type${i} = ANY(note.attachedFileTypes)`, { [`type${i}`]: type });
	}
}));
```

### パラメーターが `null` になりうるときはSQLを出し分ける

```ts
query.where('file.folderId = :folderId', { folderId: ps.folderId });
```

で `ps.folderId` が `null` だと、`file.folderId = null` という正しくないSQLになり、期待した結果が得られません。

```ts
if (ps.folderId) {
	query.where('file.folderId = :folderId', { folderId: ps.folderId });
} else {
	query.where('file.folderId IS NULL');
}
```

### `null` が入りうるカラムに `IN` を使うとき

`IN` は `null` に一致しません。`OR` を足すなどして、`null` を別に扱ってください。

### 配列のインデックスは1から始まる

SQLの配列は、インデックスが**1始まり**です。`[a, b, c]` の `a` を取り出すときは `[0]` ではなく `[1]` と書きます。

## マイグレーション

### 作り方

`packages/backend` で実行します。

```bash
pnpm typeorm migration:generate -d ormconfig.js -o --esm migration/MigrationName
```

生成されたファイルには、不要な変更が含まれることがあります。必要な部分だけを残してください。

大きなテーブルを書き換えるマイグレーションは、起動のたびに走るので、対象の行を絞り込むなどして負荷を抑えてください。

### enumの値を消すときは気をつける

enumの値を削除するには、その値を持つレコードをすべて削除しなければなりません。削除が重い、または不可能な場合は、値を消さずに残しておきます。

## NestJS

### サービスの循環参照でエラーになったとき

まずは `forwardRef` を試します。

```ts
export class FooService {
	constructor(
		@Inject(forwardRef(() => BarService))
		private barService: BarService,
	) {
	}
}
```

それで解決しない場合は、`OnModuleInit` と `ModuleRef` を使います。

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { BarService } from '@/core/BarService';

@Injectable()
export class FooService implements OnModuleInit {
	private barService: BarService; // constructor から移す

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

この場合、ユニットテストでは `onModuleInit` を自分で呼ぶ必要があります。

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
				{ // モックにする（必須ではありません）
					provide: BarService,
					useFactory: () => ({
						incredibleMethod: vi.fn(),
					}),
				},
				{ // 名前で取得できるようにする
					provide: BarService.name,
					useExisting: BarService,
				},
			],
		})
			.useMocker(...)
			.compile();

		fooService = app.get<FooService>(FooService);
		barService = app.get<BarService>(BarService) as Mocked<BarService>;

		// onModuleInit を実行する
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

## ActivityPubの拡張プロパティ

ActivityPubのペイロードに独自のプロパティを足すときのルールは、[CONTRIBUTING.md の ActivityPub payload changes](https://github.com/bettaku/engawa/blob/develop/CONTRIBUTING.md#activitypub-payload-changes) にあります。要点は次のとおりです。

- 名前には `_misskey_` を付けます（例: `_misskey_quote`）。
- `packages/backend/src/core/activitypub/type.ts` では**省略可能**として宣言します。
- `packages/backend/src/core/activitypub/misc/contexts.ts` のコンテキスト定義に追加します。
