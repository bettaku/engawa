/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// happy-dom 20.10+ returns null from HTMLCanvasElement#getContext unless a
// canvasAdapter is configured. Some modules (e.g. canvas-confetti) touch a 2D
// context at import time, so register a no-op adapter before anything else
// is imported. Kept in its own setup file so it runs before setup.unit.ts' imports.

const noopCanvasContext = new Proxy({} as Record<string | symbol, unknown>, {
	get(target, prop) {
		if (prop === 'getImageData' || prop === 'createImageData') {
			return (_sx: number, _sy: number, sw = 1, sh = 1) => ({ data: new Uint8ClampedArray(sw * sh * 4), width: sw, height: sh });
		}
		if (prop === 'measureText') return () => ({ width: 0 });
		if (prop in target) return target[prop];
		if (typeof prop === 'string' && /^[a-z]/.test(prop)) return () => undefined;
		return undefined;
	},
	set(target, prop, value) {
		target[prop] = value;
		return true;
	},
});

const happyDOM = (globalThis as unknown as { happyDOM?: { settings?: Record<string, unknown> } }).happyDOM;
if (happyDOM?.settings) {
	happyDOM.settings.canvasAdapter = {
		getContext: () => noopCanvasContext,
		toDataURL: () => 'data:,',
		toBlob: (_caller: unknown, callback: (blob: null) => void) => callback(null),
	};
}
