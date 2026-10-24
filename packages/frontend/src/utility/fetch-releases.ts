/*
 * SPDX-FileCopyrightText: noridev and cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { compareVersions } from 'compare-versions';
import { version } from '@@/js/config.js';
import { misskeyApi } from '@/utility/misskey-api.js';

export const ENGAWA_REPO = 'bettaku/engawa';

// 1.0.0 より前の表記（例: 4.17.0-engawa20260408）。数字の上では 1.0.0 以降より大きいが、実際には古い
const isLegacyEngawaVersion = (v: string) => /-engawa\d/.test(v);

/** current より release のほうが新しいか（旧表記のバージョンは、新しい表記のリリースより古いとみなす） */
export function isNewerRelease(current: string, release: string): boolean {
	if (isLegacyEngawaVersion(current) !== isLegacyEngawaVersion(release)) return isLegacyEngawaVersion(current);
	return compareVersions(current, release) < 0;
}

export const openCommitPage = (repo: string, hash: string) => {
	if (hash && hash !== 'unknown') {
		window.open(`https://github.com/${repo}/commit/${hash}`, '_blank');
	}
};

export async function fetchCherrypickReleases(): Promise<boolean> {
	try {
		const meta = await misskeyApi('admin/meta');
		const response = await window.fetch(`https://api.github.com/repos/${ENGAWA_REPO}/releases`);
		const releasesData = await response.json();

		if (!Array.isArray(releasesData) || releasesData.length === 0) {
			console.warn('No Engawa releases found.');
			return false;
		}

		const latestRelease = meta.enableReceivePrerelease
			? releasesData[0]
			: releasesData.filter((x: any) => !x.prerelease)[0];

		if (!latestRelease || !latestRelease.tag_name || typeof latestRelease.tag_name !== 'string') {
			console.warn('Invalid latest Engawa release:', latestRelease);
			return false;
		}

		return (
			isNewerRelease(version, latestRelease.tag_name) &&
			(meta.skipCherryPickVersion == null || isNewerRelease(meta.skipCherryPickVersion, latestRelease.tag_name))
		);
	} catch (error) {
		console.error('Failed to fetch Engawa releases:', error);
		return false;
	}
}

export async function getCommitHashForRelease(repo: string, release: any): Promise<string> {
	try {
		const response = await window.fetch(`https://api.github.com/repos/${repo}/commits/${release.tag_name}`);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		const commitData = await response.json();
		return commitData.sha || 'unknown';
	} catch (error) {
		console.error(`Failed to fetch commit hash for ${release.tag_name}:`, error);
		return 'unknown';
	}
}
