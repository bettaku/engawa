<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
	<div :class="$style.root">
		<i class="ti ti-alert-triangle" style="margin-right: 8px;"></i>
		{{ i18n.ts._serverSettings.bubbleTimelineDisabled }}
	</div>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n';
</script>

<style lang="scss" module>
.root {
	font-size: 0.8em;
	padding: 16px;
	background: var(--MI_THEME-infoWarnBg);
	color: var(--MI_THEME-infoWarnFg);
	border-radius: var(--MI-radius);
	overflow: clip;
	margin: 8px;
}
</style>
