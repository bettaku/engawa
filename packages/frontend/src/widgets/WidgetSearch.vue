<!--
SPDX-FileCopyrightText: marie and other Sharkey contributors, and esurio
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
	<MkContainer :showHeader="widgetProps.showHeader" class="skw-search">
		<MkInput v-model="searchQuery" :large="true" type="search" @keydown="onInputKeydown">
			<template #suffix>
				<button style="border: none; background: none; margin-right: 0.5em; z-index: 2; pointer-events: auto; position: relative; margin-top: 0 auto;" @click="onFilterClick"><i class="ti ti-filter"></i></button>
				<button style="border: none; background: none; z-index: 2; pointer-events: auto; position: relative; margin: 0 auto;" @click="search"><i class="ti ti-zoom"></i></button>
			</template>
		</MkInput>
	</MkContainer>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, ref } from 'vue';
import { useWidgetPropsManager, WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import MkInput from '@/components/MkInput.vue';
import MkContainer from '@/components/MkContainer.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import * as os from '@/os.js';
import { useRouter } from '@/router/supplier.js';
import { GetFormResultType } from '@/scripts/form.js';

const name = 'search';

const widgetPropsDef = {
	showHeader: {
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

function onInputKeydown(evt: KeyboardEvent) {
	if (evt.key === 'Enter') {
		evt.preventDefault();
		evt.stopPropagation();
		search();
	}
}

function onFilterClick(ev) {
	os.popupMenu([{
		type: 'parent',
		text: i18n.ts.options,
		icon: 'ti ti-filter',
		children: [
			{
				type: 'switch',
				icon: 'ti ti-eye-off',
				text: i18n.ts._advancedSearch._searchOption.toggleCW,
				ref: excludeNsfw,
			},
			{
				type: 'switch',
				icon: 'ti ti-ufo-off',
				text: i18n.ts.antennaExcludeBots,
				ref: excludeBots,
			},
		],
	}], ev.currentTarget ?? ev.target);
}

const router = useRouter();

let key = ref(0);
let searchQuery = ref('');
let notePagination = ref();
let isLocalOnly = ref(false);
let order = ref(true);
let excludeNsfw = ref(false);
let excludeBots = ref(false);

async function search() {
	const query = searchQuery.value.toString().trim();

	if (query == null || query === '') return;

	if (query.startsWith('https://')) {
		const promise = misskeyApi('ap/show', {
			uri: query,
		});

		os.promiseDialog(promise, null, null, i18n.ts.fetchingAsApObject);

		const res = await promise;

		if (res.type === 'User') {
			router.push(`/@${res.object.username}@${res.object.host}`);
		} else if (res.type === 'Note') {
			router.push(`/notes/${res.object.id}`);
		}

		return;
	}

	if (query.match(/^@[a-z0-9_.-]+@[a-z0-9_.-]+$/i)) {
		router.push(`/${query}`);
		return;
	}

	if (query.startsWith('#')) {
		router.push(`/tags/${encodeURIComponent(query.substring(1))}`);
		return;
	}

	notePagination.value = {
		endpoint: 'notes/search',
		limit: 10,
		params: {
			query: searchQuery,
			userId: null,
			order: order.value ? 'desc' : 'asc',
			excludeNsfw: excludeNsfw.value,
			excludeBots: excludeBots.value,
		},
	};

	if (isLocalOnly.value) notePagination.value.params.host = '.';

	key.value++;

	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkSearchResultWindow.vue')), {
		noteKey: key.value,
		notePagination: notePagination.value,
	}, {
		closed: () => dispose(),
	});
	}

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
	</script>

<style lang="scss" module>
.skwSearch {
	border-radius: var(--MI-radius-sm) !important;
}

.searchBtn {
	position: relative;
	z-index: 2;
	margin: 0 auto;
	border: none;
	background: none;
	pointer-events: auto;
}
</style>
