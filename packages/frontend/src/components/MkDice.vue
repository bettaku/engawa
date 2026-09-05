<!--
SPDX-FileCopyrightText: noridev and cherrypick-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div>
		<MkInput v-model="diceCount" small type="number" :min="1" :max="MAX_DICE_COUNT" :class="$style.input">
			<template #label>{{ i18n.ts._dice.diceCount }}</template>
		</MkInput>
	</div>
	<div>
		<MkInput v-model="diceFaces" small type="number" :min="1" :max="MAX_DICE_FACES" :class="$style.input">
			<template #label>{{ i18n.ts._dice.diceFaces }}</template>
		</MkInput>
	</div>
	<div>
		<MkButton large primary style="margin: 0 auto;" @click="rollDice">
			<i class="ti ti-dice-2"></i>
			{{ i18n.ts._dice.rollDice }}
		</MkButton>
	</div>
	<div v-if="diceRolls.length > 1" :class="$style.rolls">
		<span v-for="(roll, i) in diceRolls" :key="i" :class="$style.roll">{{ roll }}</span>
	</div>
	<div v-if="diceResult != null" :class="$style.result">{{ diceResult }}</div>
	<div v-if="showMinTotal" :class="$style.option">{{ diceMinTotal }}</div>
	<div v-if="showMaxTotal" :class="$style.option">{{ diceMaxTotal }}</div>
	<div v-if="showAverageTotal" :class="$style.option">{{ diceAverageTotal }}</div>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import type { Ref } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';

const MAX_DICE_COUNT = 999;
const MAX_DICE_FACES = 1000;

const props = withDefaults(defineProps<{
	showMinTotal?: boolean;
	showMaxTotal?: boolean;
	showAverageTotal?: boolean;
}>(), {
	showMinTotal: false,
	showMaxTotal: false,
	showAverageTotal: false,
});

const diceCount = ref(1);
const diceFaces = ref(6);
const diceRolls: Ref<number[]> = ref([]);
const diceResult: Ref<number | null> = ref(null);
const diceMinTotal: Ref<number | null> = ref(null);
const diceMaxTotal: Ref<number | null> = ref(null);
const diceAverageTotal: Ref<number | null> = ref(null);

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(Math.max(Math.floor(value), min), max);
}

// 剰余による偏りを避けるため、範囲外の値を捨てて引き直す
function rollOne(faces: number): number {
	const limit = Math.floor(0x100000000 / faces) * faces;
	const buffer = new Uint32Array(1);
	let value: number;
	do {
		crypto.getRandomValues(buffer);
		value = buffer[0];
	} while (value >= limit);
	return (value % faces) + 1;
}

const rollDice = () => {
	const count = clamp(Number(diceCount.value), 1, MAX_DICE_COUNT);
	const faces = clamp(Number(diceFaces.value), 1, MAX_DICE_FACES);

	// 丸められた値を入力欄にも反映する
	diceCount.value = count;
	diceFaces.value = faces;

	const rolls: number[] = [];
	for (let i = 0; i < count; i++) {
		rolls.push(rollOne(faces));
	}

	diceRolls.value = rolls;
	diceResult.value = rolls.reduce((a, b) => a + b, 0);
	diceMinTotal.value = count;
	diceMaxTotal.value = count * faces;
	diceAverageTotal.value = count * (faces + 1) / 2;
};

</script>

<style lang="scss" module>
.root {
	padding: 8px 16px;

	> div {
		margin: 8px 0;
	}
}

.input {
	flex: 1 1 auto;
	padding: 8px;
}

.rolls {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 4px;
	max-height: 200px;
	overflow-y: auto;
}

.roll {
	padding: 2px 6px;
	border-radius: 4px;
	background: var(--MI_THEME-buttonBg);
	line-height: 1.2;
}

.result {
	text-align: center;
	margin: auto;
}

.option {
	padding: 8px 0;
	text-align: left;
}
</style>
