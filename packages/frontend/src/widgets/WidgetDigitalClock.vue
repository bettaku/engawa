<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div data-e2e-mkw-digitalClock class="_monospace" :class="[$style.root, { _panel: !widgetProps.transparent }]" :style="{ fontSize: `${widgetProps.fontSize}em` }">
	<div v-if="widgetProps.showLabel" :class="$style.label">{{ tzAbbrev }}</div>
	<div>
		<MkDigitalClock :showMs="widgetProps.showMs" :tz="timeZone"/>
	</div>
	<div v-if="widgetProps.showLabel" :class="$style.label">{{ tzOffsetLabel }}</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import { timezones } from '@/utility/timezones.js';
import MkDigitalClock from '@/components/MkDigitalClock.vue';

const name = 'digitalClock';

const widgetPropsDef = {
	transparent: {
		type: 'boolean',
		default: false,
	},
	fontSize: {
		type: 'number',
		default: 1.5,
		step: 0.1,
	},
	showMs: {
		type: 'boolean',
		default: true,
	},
	showLabel: {
		type: 'boolean',
		default: true,
	},
	timezone: {
		type: 'enum',
		default: null,
		enum: [...timezones.apply(null).map((tz) => ({
			label: tz.name,
			value: tz.name.toLowerCase(),
		})), {
			label: '(auto)',
			value: null,
		}],
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

const timeZone = computed(() => (
	widgetProps.timezone === null
		? Intl.DateTimeFormat().resolvedOptions().timeZone
		: timezones.apply(null).find((tz) => tz.name.toLowerCase() === widgetProps.timezone)?.name ?? 'UTC'
));

const tzAbbrev = computed(() => (
	widgetProps.timezone === null
		? timeZone.value.toString()
		: timezones.apply(null).find((tz) => tz.name.toLowerCase() === widgetProps.timezone)?.name ?? '?'
));

const tzOffset = computed(() => (
	widgetProps.timezone === null
		? new Intl.DateTimeFormat('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, timeZoneName: 'longOffset' })
			.formatToParts(new Date())
			.find((part) => part.type === 'timeZoneName')?.value
			.trim() ?? 0
		: new Intl.DateTimeFormat('en-US', { timeZone: timeZone.value, timeZoneName: 'longOffset' })
			.formatToParts(new Date())
			.find((part) => part.type === 'timeZoneName')?.value
			.trim() ?? 0
));

console.log('tzOffset', tzOffset.value);

const tzOffsetLabel = computed(() => {
	const offset = tzOffset.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, '').replace(/^GMT/, 'UTC');
	console.log('tzOffsetLabel', offset);
	return `${offset}`;
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.root {
	padding: 16px 0;
	text-align: center;
}

.label {
	font-size: 65%;
	opacity: 0.7;
}
</style>
