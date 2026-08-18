# changelog-checker

## What
CHANGELOG_ENGAWA.mdに差分があるかチェックするpackage。

## How to Use

GitHub Actionsから。
```yaml
name: Check the description in CHANGELOG_ENGAWA.md

on:
  pull_request:
    branches:
      - master
      - develop

jobs:
  check-changelog:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout head
        uses: actions/checkout@v7

      - name: Setup pnpm
        uses: pnpm/action-setup@v6
      - name: Setup Node.js
        uses: actions/setup-node@v4.4.0
        with:
          node-version-file: '.node-version'

      - name: Install dependencies
        run: pnpm --filter changelog-checker install

      - name: Checkout base
        run: |
          mkdir _base
          cp -r .git _base/.git
          cd _base
          git fetch --depth 1 origin ${{ github.base_ref }}
          git checkout origin/${{ github.base_ref }} CHANGELOG_ENGAWA.md

      - name: Copy to Checker directory for CHANGELOG_ENGAWA-base.md
        run: cp _base/CHANGELOG_ENGAWA.md packages-internal/changelog-checker/CHANGELOG_ENGAWA-base.md
      - name: Copy to Checker directory for CHANGELOG_ENGAWA-head.md
        run: cp CHANGELOG_ENGAWA.md packages-internal/changelog-checker/CHANGELOG_ENGAWA-head.md
      - name: diff
        continue-on-error: true
        run: diff -u CHANGELOG_ENGAWA-base.md CHANGELOG_ENGAWA-head.md
        working-directory: packages-internal/changelog-checker
      - name: Run Checker
        run: pnpm --filter changelog-checker run check

```

## idea
- 別リポジトリに分離してシングルバイナリにしたい
