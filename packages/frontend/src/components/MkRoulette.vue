<template>
<div :class="$style.root">
	<div :class="$style.container">
		<div ref="wheel" :class="$style.wheel" :style="wheelStyle">
			<div
				v-for="(item, index) in items"
				:key="index"
				:class="$style.segment"
				:style="getSegmentStyle(index)"
			>
				<div :class="$style.content" :style="getContentStyle(index)">{{ item.label }}</div>
			</div>
		</div>
		<div :class="$style.marker"></div>
	</div>

	<div :class="$style.controls">
		<button :class="$style.spinButton" :disabled="spinning" @click="spin">{{ spinning ? i18n.ts.spinning : i18n.ts.spin }}</button>
		<div v-if="result" :class="$style.result">{{ i18n.ts.result }}: {{ result.label }}</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n';
import * as os from '@/os';

interface RouletteItem {
	id: string | number;
	label: string;
	color?: string;
	textColor?: string;
}

const props = withDefaults(defineProps<{
	items: RouletteItem[];
	spinTime?: number;
	minSpins?: number;
	maxSpins?: number;
}>(), {
	spinTime: 5000,
	minSpins: 3,
	maxSpins: 10,
});

const emit = defineEmits<{
	(e: 'result', item: RouletteItem): void;
}>();

const wheel = ref<HTMLElement | null>(null);
const spinning = ref(false);
const rotation = ref(0);
const result = ref<RouletteItem | null>(null);

const wheelStyle = computed(() => {
	return {
		transform: `rotate(${rotation.value}deg)`,
	};
});

const getSegmentStyle = (index: number) => {
	const segmentAngle = 360 / props.items.length;
	const skewAngle = 90 - segmentAngle;

	return {
		transform: `rotate(${rotation.value}deg) skew(${skewAngle}deg)`,
		backgroundColor: props.items[index].color || getRandomColor(index),
	};
};

function getRandomColor(index: number): string {
	const colors = [
		'#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA5A5',
		'#779ECB', '#FFD166', '#06D6A0', '#EF476F',
		'#118AB2', '#073B4C', '#7678ED', '#F8961E',
	];
	return colors[index % colors.length];
}

function spin() {
	if (spinning.value) return;

	spinning.value = true;
	result.value = null;

	// ランダムな回転数を決定
	const spins = Math.floor(Math.random() * (props.maxSpins - props.minSpins + 1)) + props.minSpins;

	// ランダムな項目を選択
	const resultIndex = Math.floor(Math.random() * props.items.length);
	const segmentAngle = 360 / props.items.length;

	// 回転角度を計算 (完全な回転 + 選択された項目の位置まで)
	const targetRotation = rotation.value + (spins * 360) + (segmentAngle * resultIndex);

	// CSSアニメーション用のキーフレームを動的に生成
	const keyframes = [
		{ transform: `rotate(${rotation.value}deg)` },
		{ transform: `rotate(${targetRotation}deg)` },
	];

	const timing = {
		duration: props.spinTime,
		easing: 'cubic-bezier(0.1, 0.7, 0.1, 1)', // 始めは速く、徐々に遅くなる
		fill: 'forwards',
	};

	if (wheel.value) {
		const animation = wheel.value.animate(keyframes, timing);

		animation.onfinish = () => {
			rotation.value = targetRotation % 360;
			spinning.value = false;
			result.value = props.items[resultIndex];
			emit('result', props.items[resultIndex]);
		};
	}
}

</script>

<style lang="scss" module>
.root {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  padding: 1rem;
}

.container {
  position: relative;
  width: 300px;
  height: 300px;
}

.wheel {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  transition: transform 0.3s ease;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
  border: 10px solid var(--MI_THEME-panel);
  will-change: transform;
}

.segment {
  position: absolute;
  top: 0;
  right: 0;
  width: 50%;
  height: 50%;
  transform-origin: 0% 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 5%;
  overflow: hidden;
  box-sizing: border-box;
}

.content {
  font-weight: bold;
  text-align: right;
  white-space: nowrap;
  font-size: 0.9em;
  transform-origin: center;
  padding: 0 10px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.marker {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 15px solid transparent;
  border-right: 15px solid transparent;
  border-top: 30px solid var(--MI_THEME-accent);
  z-index: 1;
}

.controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.spinButton {
  padding: 0.8rem 2rem;
  background: var(--MI_THEME-accent);
  color: var(--MI_THEME-fgOnAccent);
  border: none;
  border-radius: 50px;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    opacity: 0.9;
    transform: scale(1.05);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.result {
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--MI_THEME-accent);
  animation: fadeIn 0.5s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
