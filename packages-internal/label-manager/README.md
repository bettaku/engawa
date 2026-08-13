# label-manager

## What
リポジトリのIssue labelsを管理するpackage。  
labelerではない。

## How to use
### 事前準備
- `.github/labels.yml`を用意しておくこと

### GitHub Actionsから
```yaml
on:
  push:
    branches:
      - main
      - develop
    paths:
      - '.github/labels.yml'
      - '.github/workflows/labels-update.yml'
  workflow_dispatch:

jobs:
  update-labels:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      contents: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          persist-credentials: false

      - name: Setup pnpm
        uses: pnpm/action-setup@v6

      - name: Set up Node.js
        uses: actions/setup-node@v4.4.0
        with:
          node-version-file: '.node-version'

      - name: Install dependencies
        run: pnpm --filter label-manager install

      - name: Update labels
        run: pnpm --filter label-manager run update
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
