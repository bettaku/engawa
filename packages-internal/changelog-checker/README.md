# changelog-checker

## What
CHANGELOG_engawa.mdに差分があるかチェックするpackage。

## How to Use

GitHub Actionsから。
```yaml
name: Check the description in CHANGELOG_engawa.md

on:
  pull_request:
    branches:
      - main
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
          git checkout origin/${{ github.base_ref }} CHANGELOG_engawa.md

      - name: Copy to Checker directory for CHANGELOG_engawa-base.md
        run: cp _base/CHANGELOG_engawa.md packages-internal/changelog-checker/CHANGELOG_engawa-base.md
      - name: Copy to Checker directory for CHANGELOG_engawa-head.md
        run: cp CHANGELOG_engawa.md packages-internal/changelog-checker/CHANGELOG_engawa-head.md
      - name: diff
        continue-on-error: true
        run: diff -u CHANGELOG_engawa-base.md CHANGELOG_engawa-head.md
        working-directory: packages-internal/changelog-checker
      - name: Run Checker
        run: pnpm --filter changelog-checker run check

```

## idea
- 別リポジトリに分離してシングルバイナリにしたい
