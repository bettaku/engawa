<!--
SPDX-FileCopyrightText: noridev and cherrypick-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer></MkContainer>
</template>

<script lang="ts" setup>
import { onMounted, watch } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkRoulette from '@/components/MkRoulette.vue';

const name = 'roulette';

const widgetPropsDef = {
	transparent: {},
};

</script>

<style lang="scss" module></style>
