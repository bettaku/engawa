/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { writeFileSync } from 'node:fs';
import { standardSchema } from '../built/config/schema.js';

writeFileSync(new URL('../config.schema.json', import.meta.url), JSON.stringify(standardSchema(), null, 2) + '\n');
