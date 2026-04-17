/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pExecFile = promisify(execFile);
const TIMEOUT_MS = 30_000;
const MAX_BUFFER = 10 * 1024 * 1024;

export type FfprobeStream = {
	codec_type?: string;
	codec_name?: string;
};

export type FfprobeResult = {
	streams: FfprobeStream[];
	format: {
		duration?: number;
	};
};

export async function probe(path: string): Promise<FfprobeResult> {
	const { stdout } = await pExecFile('ffprobe', [
		'-v', 'error',
		'-hide_banner',
		'-print_format', 'json',
		'-show_streams',
		'-show_format',
		'-i', path,
	], {
		timeout: TIMEOUT_MS,
		maxBuffer: MAX_BUFFER,
		windowsHide: true,
	});

	const parsed = JSON.parse(stdout) as {
		streams?: FfprobeStream[];
		format?: { duration?: string | number };
	};

	const duration = parsed.format?.duration;

	return {
		streams: Array.isArray(parsed.streams) ? parsed.streams : [],
		format: {
			duration: duration != null ? Number(duration) : undefined,
		},
	};
}

export async function extractFrame(source: string, timestampSec: number, outPath: string): Promise<void> {
	const ts = Number.isFinite(timestampSec) && timestampSec > 0 ? timestampSec : 0;
	await pExecFile('ffmpeg', [
		'-y',
		'-hide_banner',
		'-loglevel', 'error',
		'-ss', ts.toFixed(3),
		'-i', source,
		'-frames:v', '1',
		'-f', 'image2',
		outPath,
	], {
		timeout: TIMEOUT_MS,
		maxBuffer: MAX_BUFFER,
		windowsHide: true,
	});
}
