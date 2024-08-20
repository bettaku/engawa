<template>
	<div>
		<time>
			<span v-if="defaultStore.state.showClockAsDDMMYYYY" :class="$style.yyyymmdd">{{ dd }}/{{ mm }}/{{ yyyy }}</span>
			<span v-else :class="$style.yyyymmdd">{{ yyyy }}/{{ mm }}/{{ dd }}</span>
			<br>
			<span v-text="hh"></span>
			<span :class="[$style.colon, { [$style.showColon]: showColon }]">:</span>
			<span v-text="mm"></span>
		</time>
	</div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, watch, computed } from 'vue';
import { defaultStore } from '@/store';
import { defaultIdlingRenderScheduler } from '@/scripts/idle-render';

const props = withDefaults(defineProps<{
	now?: () => Date;
}>(), {
	now: () => new Date(),
})

const yyyy = ref('');
const mm = ref('');
const dd = ref('');
const hh = ref('');
const min = ref('');
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
	yyyy.value = now.getFullYear().toString();
	mm.value = (now.getMonth() + 1).toString().padStart(2, '0');
	dd.value = now.getDate().toString().padStart(2, '0');
	hh.value = now.getHours().toString().padStart(2, '0');
	min.value = now.getMinutes().toString().padStart(2, '0');
	if (now.getSeconds() !== prevSec) showColon.value = true;
	prevSec = now.getSeconds();
}

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
