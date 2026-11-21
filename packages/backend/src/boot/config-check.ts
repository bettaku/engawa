/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { parseArgs } from 'node:util';
import { configPath, ConfigValidationError, formatDiagnostic, parseConfigSource, type Diagnostic } from '../config/parse.js';

let diagnostics: Diagnostic[];
let json = process.argv.includes('--json');
let strict = false;
try {
	const { values, positionals } = parseArgs({
		options: { json: { type: 'boolean' }, strict: { type: 'boolean' } }, allowPositionals: true,
	});
	if (positionals.length > 1) throw new Error('usage');
	json = !!values.json;
	strict = !!values.strict;
	diagnostics = parseConfigSource(positionals[0] ?? configPath(), process.env, 'error').diagnostics;
} catch (error) {
	diagnostics = error instanceof ConfigValidationError ? error.diagnostics : [{
		level: 'error', path: '', message: error instanceof Error && 'errno' in error
			? 'Cannot read configuration file.' : 'Usage: pnpm check:config [path] [--json] [--strict]',
	}];
}
if (json) console.log(JSON.stringify(diagnostics));
else if (diagnostics.length === 0) console.log('Configuration is valid.');
else for (const diagnostic of diagnostics) console.error(`${diagnostic.level} ${formatDiagnostic(diagnostic)}`);
process.exitCode = diagnostics.some(d => d.level === 'error') || (strict && diagnostics.length > 0)
	? 1 : diagnostics.length > 0 ? 2 : 0;
