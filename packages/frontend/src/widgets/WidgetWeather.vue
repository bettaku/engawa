<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :naked="widgetProps.transparent" :showHeader="false">
	<div class="_monospace">
		<MkWeather
			:key="`${widgetProps.latitude},${widgetProps.longtitude}`"
			:latitude="widgetProps.latitude"
			:longtitude="widgetProps.longtitude"
			:showSurfacePressure="widgetProps.showSurfacePressure"
		/>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { watch } from 'vue';
import { useWidgetPropsManager, WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import MkContainer from '@/components/MkContainer.vue';
import MkWeather from '@/components/MkWeather.vue';
import { GetFormResultType } from '@/scripts/form.js';

const name = 'weather';

const widgetPropsDef = {
	transparent: {
		type: 'boolean' as const,
		default: false,
	},
	latitude: {
		type: 'number' as const,
		default: 35.6895,
	},
	longtitude: {
		type: 'number' as const,
		default: 139.6917,
	},
	showSurfacePressure: {
		type: 'boolean' as const,
		default: false,
	},
};

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

watch(() => [widgetProps.latitude, widgetProps.longtitude], { immediate: true });
watch(() => widgetProps.showSurfacePressure, { immediate: true });

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.weather {
	padding: 12px;
}

.current {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 16px;
	margin-bottom: 12px;

	& > i {
		font-size: 2.5em;
	}

	.temp {
		font-size: 2em;
		font-weight: bold;
	}
}

.daily {
	display: flex;
	justify-content: space-between;
	text-align: center;
	border-top: solid 1px var(--MI_THEME-divider);
	padding-top: 12px;
}

.day {
	display: flex;
	flex-direction: column;
	align-items: center;
}

</style>
