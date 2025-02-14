<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<i class="ti ti-exclamation-circle"></i>
	{{ i18n.ts.deprecatedCaution }}
</div>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';

</script>

<style lang="scss" module>
.root {
	font-size: 0.8em;
	padding: 16px;
	background-color: var(--MI_THEME-infoWarnBg);
	color: var(--MI_THEME-error);
	border-radius: var(--MI_THEME-radius);
}

</style>
