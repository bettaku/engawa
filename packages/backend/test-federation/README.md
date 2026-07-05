## test-federation
Test federation between two CherryPick servers: `a.test` and `b.test` (some tests also use `c.test`).

Change working directory to here:
```sh
cd packages/backend/test-federation
```

All roles (the app servers, the tester and the daemon) share a single image that
bakes in the dependencies and the build output, so you no longer need to run
`pnpm build` on the host beforehand.

First, generate certificates and configs, then build the shared image and start the servers:
```sh
bash ./setup.sh
NODE_VERSION=22 docker compose build
NODE_VERSION=22 docker compose up --scale tester=0
```

> [!NOTE]
> Rebuild the image (`docker compose build`, or `docker compose up --build`) after
> changing anything other than the test files under `./test`, which are mounted live.

Then you can run all tests by a following command:
```sh
NODE_VERSION=22 docker compose run --no-deps --rm tester
```

For testing a specific file, run a following command:
```sh
NODE_VERSION=22 docker compose run --no-deps --rm tester -- pnpm -F backend test:fed packages/backend/test-federation/test/user.test.ts
```
