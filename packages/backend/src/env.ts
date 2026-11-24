/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { loadEnvironment } from './config/environment.js';

// CP_*の環境変数の解釈は config/environment.ts にまとめた
const envOption = loadEnvironment().options;

export { envOption };
