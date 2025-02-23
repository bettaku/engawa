<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkButton v-if="$i && ($i.isModerator || $i.policies.canManageAvatarDecorations)" primary link to="/avatar-decorations">{{ i18n.ts.manageAvatarDecorations }}</MkButton>

	<div :class="$style.decorations">
		<div
			v-for="avatarDecoration in avatarDecorations"
			:key="avatarDecoration.id"
			v-panel
			:class="$style.decoration"
			@click="menu(avatarDecoration, $event)"
		>
			<div :class="$style.decorationName"><MkCondensedLine :minScale="0.5">{{ avatarDecoration.name }}</MkCondensedLine></div>
			<MkAvatar style="width: 60px; height: 60px;" :user="$i ?? demoUser" :decorations="[{ url: avatarDecoration.url }]" forceShowDecoration/>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, ref } from 'vue';
import * as Misskey from 'cherrypick-js';
import type { MenuItem } from '@/types/menu';
import { $i } from '@/account.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/scripts/misskey-api';
import MkButton from '@/components/MkButton.vue';
import { instance } from '@/instance.js';
import * as os from '@/os.js';
import MkAvatarDecorationDialog from '@/components/MkAvatarDecorationDialog.vue';
import { copyToClipboard } from '@/scripts/copy-to-clipboard';

const avatarDecorations = ref<Misskey.entities.GetAvatarDecorationsResponse>([]);
const demoUser = {
	id: 'instance.actor',
	name: 'instance.actor',
	username: 'instance.actor',
	host: null,
	avatarUrl: instance.iconUrl || '/favicon.ico',
	avatarBlurhash: null,
	avatarDecorations: [],
} satisfies Partial<Misskey.entities.UserDetailed>;

function load() {
	misskeyApi('get-avatar-decorations').then(_avatarDecorations => {
		avatarDecorations.value = _avatarDecorations;
	});
}

load();

const menu = (decoration, ev: MouseEvent) => {
	const menuItems: MenuItem[] = [{
		type: 'label',
		text: decoration.name,
	}, {
		text: i18n.ts.copy,
		icon: 'ti ti-copy',
		action: () => {
			copyToClipboard(`${decoration.name}`);
			os.success();
		},
	}, {
		text: i18n.ts.details,
		icon: 'ti ti-info-circle',
		action: () => {
			detailDecoration(decoration);
		},
	}];

	if ($i?.isModerator || $i?.isAdmin) {
		menuItems.push({
			text: i18n.ts.edit,
			icon: 'ti ti-pencil',
			action: () => {
				edit(decoration);
			},
		});
	}
	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
};

const detailDecoration = (decoration) => {
	const { dispose } = os.popup(MkAvatarDecorationDialog, {
		decoration,
	}, {
		done: () => {
			dispose();
		},
		closed: () => {
			dispose();
		},
	});
};

const edit = async (decoration) => {
	const { dispose } = os.popup(defineAsyncComponent(() => import('./avatar-decoration-edit-dialog.vue')), {
		avatarDecoration: decoration,
	}, {
		closed: () => dispose(),
	});
};

</script>

<style lang="scss" module>
.decorations {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	grid-gap: 12px;
}

.decoration {
	cursor: pointer;
	padding: 16px 16px 28px 16px;
	border-radius: 8px;
	text-align: center;
	font-size: 90%;
	overflow: clip;
	contain: content;
}

.decorationName {
	position: relative;
	z-index: 10;
	font-weight: bold;
	margin-bottom: 20px;
}

</style>
