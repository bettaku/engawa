<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader :actions="headerActions" :tabs="headerTabs"/></template>
	<MkSpacer :contentMax="800">
		<MkNotes ref="notes" class="" :pagination="pagination"/>
	</MkSpacer>
	<template v-if="$i" #footer>
		<div :class="$style.footer">
			<MkSpacer :contentMax="800" :marginMin="16" :marginMax="16">
				<MkButton rounded primary :class="$style.button" @click="post()"><i class="ti ti-pencil"></i>{{ i18n.ts.postToHashtag }}</MkButton>
			</MkSpacer>
		</div>
	</template>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import MkNotes from '@/components/MkNotes.vue';
import MkButton from '@/components/MkButton.vue';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/account.js';
import { defaultStore } from '@/store.js';
import * as os from '@/os.js';
import { useStream } from '@/stream';
import * as Misskey from 'cherrypick-js';
import { globalEvents } from '@/events';
import { genEmbedCode } from '@/scripts/get-embed-code.js';

const props = defineProps<{
	tag: string;
}>();

const pagination = {
	endpoint: 'notes/search-by-tag' as const,
	limit: 10,
	params: computed(() => ({
		tag: props.tag,
	})),
};
const notes = ref<InstanceType<typeof MkNotes>>();

//#region ChannelConnection
let connection: Misskey.ChannelConnection | null = null;

const stream = useStream();

function connectChannel() {
	connection = stream.useChannel('hashtag', {
		q: [[props.tag]],
	});
	connection?.on('note', note => {
		notes.value?.pagingComponent?.prepend(note);
	});
}

function disconnectChannel() {
	if (connection) connection.dispose();
}

function refreshChannel() {
	if (!defaultStore.state.disableStreamingTimeline) {
		disconnectChannel();
		connectChannel();
	}
}

onMounted(() => {
	globalEvents.on('reloadTimeline', () => reloadTimeline());
});

onUnmounted(() => {
	disconnectChannel();
});

refreshChannel();

function reloadTimeline() {
	return new Promise<void>((res) => {
		if (notes.value == null) return;

		notes.value.pagingComponent?.reload().then(() => {
			res();
		});
	});
}
//#endregion

async function post() {
	defaultStore.set('postFormHashtags', props.tag);
	defaultStore.set('postFormWithHashtags', true);
	await os.post();
	defaultStore.set('postFormHashtags', '');
	defaultStore.set('postFormWithHashtags', false);
}

const headerActions = computed(() => [{
	icon: 'ti ti-dots',
	label: i18n.ts.more,
	handler: (ev: MouseEvent) => {
		os.popupMenu([{
			text: i18n.ts.genEmbedCode,
			icon: 'ti ti-code',
			action: () => {
				genEmbedCode('tags', props.tag);
			},
		}], ev.currentTarget ?? ev.target);
	},
}]);

const headerTabs = computed(() => []);

definePageMetadata(() => ({
	title: props.tag,
	icon: 'ti ti-hash',
}));

defineExpose({
	reloadTimeline,
});
</script>

<style lang="scss" module>
.footer {
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	background: var(--MI_THEME-acrylicBg);
	border-top: solid 0.5px var(--MI_THEME-divider);
	display: flex;
}

.button {
	margin: 0 auto;
}
</style>
