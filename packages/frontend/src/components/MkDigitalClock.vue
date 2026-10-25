<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span>
	<span v-text="hh"></span>
	<span :class="[$style.colon, { [$style.showColon]: showColon }]">:</span>
	<span v-text="mm"></span>
	<span v-if="showS" :class="[$style.colon, { [$style.showColon]: showColon }]">:</span>
	<span v-if="showS" v-text="ss"></span>
	<span v-if="showMs" :class="[$style.colon, { [$style.showColon]: showColon }]">:</span>
	<span v-if="showMs" v-text="ms"></span>
</span>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { defaultIdlingRenderScheduler } from '@/utility/idle-render.js';

const props = withDefaults(defineProps<{
	showS?: boolean;
	showMs?: boolean;
	tz?: string;
	now?: () => Date;
}>(), {
	showS: true,
	showMs: false,
	tz: 'UTC',
	now: () => new Date(),
});

const hh = ref('');
const mm = ref('');
const ss = ref('');
const ms = ref('');
const showColon = ref(false);
let prevSec: number | null = null;

watch(showColon, (v) => {
	if (v) {
		window.setTimeout(() => {
			showColon.value = false;
		}, 30);
	}
});

const tick = (): void => {
	const now = props.now();
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: props.tz,
		hour: '2-digit',
		minute: '2-digit',
		second: props.showS ? '2-digit' : undefined,
		hour12: false,
	});
	hh.value = formatter.formatToParts(now).find((part) => part.type === 'hour')?.value ?? '';
	mm.value = formatter.formatToParts(now).find((part) => part.type === 'minute')?.value ?? '';
	ss.value = props.showS ? formatter.formatToParts(now).find((part) => part.type === 'second')?.value ?? '' : '';
	ms.value = props.showMs ? String(now.getMilliseconds()).padStart(3, '0') : '';
	if (prevSec !== null && prevSec !== now.getSeconds()) {
		showColon.value = true;
	}
	prevSec = now.getSeconds();
};

tick();

onMounted(() => {
	defaultIdlingRenderScheduler.add(tick);
});

onUnmounted(() => {
	defaultIdlingRenderScheduler.delete(tick);
});
</script>

<style lang="scss" module>
.colon {
	opacity: 0;
	transition: opacity 1s ease;

	&.showColon {
		opacity: 1;
		transition: opacity 0s;
	}
}
</style>
