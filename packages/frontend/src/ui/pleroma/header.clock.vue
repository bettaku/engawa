<template>
	<div>
		<time></time>
	</div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, watch, computed } from 'vue';

const props = withDefaults(defineProps<{
	showS?: boolean;
	showMs?: boolean;
	now?: () => Date;
}>(), {
	showS: true,
	showMs: false,
	now: () => new Date(),
})

const yyyy = ref('');
const mm = ref('');
const dd = ref('');

computed(() => {
	const now = props.now();
	yyyy.value = now.getFullYear().toString();
	mm.value = ('0' + (now.getMonth() + 1)).slice(-2);
	dd.value = ('0' + now.getDate()).slice(-2);
});

</script>

<style lang="scss" module></style>
