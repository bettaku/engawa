<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :naked="widgetProps.transparent" :showHeader="false" data-cy-mkw-clock>
	<div
		:class="[$style.root, {
			[$style.small]: widgetProps.size === 'small',
			[$style.medium]: widgetProps.size === 'medium',
			[$style.large]: widgetProps.size === 'large',
		}]"
	>
		<div v-if="widgetProps.label === 'tz' || widgetProps.label === 'timeAndTz'" class="_monospace" :class="[$style.label, $style.a]">{{ tzAbbrev }}</div>
		<MkAnalogClock
			:class="$style.clock"
			:thickness="widgetProps.thickness"
			:tz="timeZone"
			:graduations="widgetProps.graduations"
			:fadeGraduations="widgetProps.fadeGraduations"
			:twentyfour="widgetProps.twentyFour"
			:sAnimation="widgetProps.sAnimation"
		/>
		<MkDigitalClock v-if="widgetProps.label === 'time' || widgetProps.label === 'timeAndTz'" :class="[$style.label, $style.c]" class="_monospace" :showS="false" :tz="timeZone"/>
		<div v-if="widgetProps.label === 'tz' || widgetProps.label === 'timeAndTz'" class="_monospace" :class="[$style.label, $style.d]">{{ tzOffsetLabel }}</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkAnalogClock from '@/components/MkAnalogClock.vue';
import MkDigitalClock from '@/components/MkDigitalClock.vue';
import { timezones } from '@/utility/timezones.js';
import { i18n } from '@/i18n.js';

const name = 'clock';

const widgetPropsDef = {
	transparent: {
		type: 'boolean',
		default: false,
	},
	size: {
		type: 'radio',
		default: 'medium',
		options: [{
			value: 'small' as const,
			label: i18n.ts.small,
		}, {
			value: 'medium' as const,
			label: i18n.ts.medium,
		}, {
			value: 'large' as const,
			label: i18n.ts.large,
		}],
	},
	thickness: {
		type: 'radio',
		default: 0.2,
		options: [{
			value: 0.1 as const,
			label: 'thin',
		}, {
			value: 0.2 as const,
			label: 'medium',
		}, {
			value: 0.3 as const,
			label: 'thick',
		}],
	},
	graduations: {
		type: 'radio',
		default: 'numbers',
		options: [{
			value: 'none' as const,
			label: 'None',
		}, {
			value: 'dots' as const,
			label: 'Dots',
		}, {
			value: 'numbers' as const,
			label: 'Numbers',
		}],
	},
	fadeGraduations: {
		type: 'boolean',
		default: true,
	},
	sAnimation: {
		type: 'radio',
		default: 'elastic',
		options: [{
			value: 'none' as const,
			label: 'None',
		}, {
			value: 'elastic' as const,
			label: 'Elastic',
		}, {
			value: 'easeOut' as const,
			label: 'Ease out',
		}],
	},
	twentyFour: {
		type: 'boolean',
		default: false,
	},
	label: {
		type: 'radio',
		default: 'none',
		options: [{
			value: 'none' as const,
			label: 'None',
		}, {
			value: 'time' as const,
			label: 'Time',
		}, {
			value: 'tz' as const,
			label: 'TZ',
		}, {
			value: 'timeAndTz' as const,
			label: 'Time + TZ',
		}],
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

console.log('timeZone', timeZone.value);

// PLAN:tzAbbrev から tzNameに改名
const tzAbbrev = computed(() => (
	widgetProps.timezone === null
		? timeZone.value.toString()
		: timezones.apply(null).find((tz) => tz.name.toLowerCase() === widgetProps.timezone)?.name ?? '?'
));

const tzOffset = computed(() => (
	widgetProps.timezone === null
		? new Intl.DateTimeFormat('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, timeZoneName: 'short' })
			.formatToParts(new Date())
			.find((part) => part.type === 'timeZoneName')?.value
			.replace(/UTC/i, '')
			.trim() ?? 0
		: new Intl.DateTimeFormat('en-US', { timeZone: timeZone.value, timeZoneName: 'short' })
			.formatToParts(new Date())
			.find((part) => part.type === 'timeZoneName')?.value
			.replace(/UTC/i, '')
			.trim() ?? 0
));

console.log('tzOffset', tzOffset.value);

const tzOffsetLabel = computed(() => {
	const offset = tzOffset.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, '').replace(/GMT/, '');
	console.log('tzOffsetLabel', offset);
	return offset.startsWith('+') || offset.startsWith('-') ? `UTC${offset}` : `UTC+${offset}`;
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.root {
	position: relative;

	&.small {
		padding: 12px;

		> .clock {
			height: 100px;
		}
	}

	&.medium {
		padding: 14px;

		> .clock {
			height: 150px;
		}
	}

	&.large {
		padding: 16px;

		> .clock {
			height: 200px;
		}
	}
}

.label {
	position: absolute;
	opacity: 0.7;

	&.a {
		top: 14px;
		left: 14px;
	}

	&.b {
		top: 14px;
		right: 14px;
	}

	&.c {
		bottom: 14px;
		left: 14px;
	}

	&.d {
		bottom: 14px;
		right: 14px;
	}
}

.clock {
	margin: auto;
}
</style>
