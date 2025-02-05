# mfc.js
An MFC parser implementation with TypeScript.
[Try it out!](https://runkit.com/npm/mfc-js)

[![Test](https://github.com/kokonect-link/mfc.js/actions/workflows/test.yml/badge.svg)](https://github.com/kokonect-link/mfc.js/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/kokonect-link/mfc.js/branch/develop/graph/badge.svg?token=irAWFiHK8T)](https://codecov.io/gh/kokonect-link/mfc.js)

[![NPM](https://nodei.co/npm/mfc-js.png?downloads=true&downloadRank=true&stars=true)](https://www.npmjs.com/package/mfc-js)

## Installation
```
npm i mfc-js
```

## Usage
Please see [docs](./docs/index.md) for the detail.

TypeScript:
```ts
import * as mfc from 'mfc-js';

const inputText =
`<center>
Hello $[tada everynyan! 🎉]

I'm @ai, A bot of misskey!

https://github.com/syuilo/ai
</center>`;

// Generate a MFC tree from the full MFC text.
const mfmTree = mfm.parse(inputText);

// Generate a MFC tree from the simple MFC text.
const simpleMfmTree = mfm.parseSimple('I like the hot soup :soup:​');

// Reverse to a MFC text from the MFC tree.
const text = mfm.toString(mfmTree);

```

## Develop
### 1. Clone
```
git clone https://github.com/kokonect-link/mfc.js.git
```

### 2. Install packages
```
cd mfc.js
npm i
```

### 3. Build
```
npm run build
```

### Use the interactive CLI parser
full parser:
```
npm run parse
```

simple parser:
```
npm run parse-simple
```

## License
This software is released under the [MIT License](LICENSE).
