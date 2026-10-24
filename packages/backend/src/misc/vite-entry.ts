/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type ViteEntry = {
	file: string | null;
	css?: string[];
	imports?: string[];
	dynamicImports?: string[];
};

/** Collect CSS for the entry and its static dependencies for server-rendered HTML. */
export function resolveViteEntry(manifest: Record<string, ViteEntry>, entryName: string): ViteEntry {
	const css = new Set<string>();
	const visited = new Set<string>();

	function visit(name: string): void {
		if (visited.has(name)) return;
		visited.add(name);
		const chunk = manifest[name];
		for (const file of chunk.css ?? []) css.add(file);
		// Dynamic imports load their own CSS when requested by Vite's runtime.
		for (const dependency of chunk.imports ?? []) visit(dependency);
	}

	visit(entryName);
	return { ...manifest[entryName], css: [...css] };
}
