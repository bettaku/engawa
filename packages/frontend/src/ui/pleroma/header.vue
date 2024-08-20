<template>
	<div :class="$style.root">
		<div :class="$style.body">
			<div :class="$style.left"></div>
			<div :class="$style.center">
				<!-- バナーとアイコン -->
				<div v-if="defaultStore.state.showBannerOnHeader" :class="$style.banner" :style="{ backgroundImage: `url(${ instance.bannerUrl })`}"></div>
				<button v-vibrate="defaultStore.state.vibrateSystem ? 5 : []" v-tooltip.noDelay.bottom="instance.name ?? i18n.ts.instance" class="_button" :class="$style.instance" @click="openInstanceMenu" >
					<img :src="instance.iconUrl || instance.faviconUrl || '/favicon.ico'" alt="" :class="$style.instanceIcon" />
				</button>
			</div>
			<div :class="$style.right">
				<!-- ホーム | 検索 | 設定 | 管理 |  光あれ -->
				<MkA v-tooltip.noDelay.bottom="i18n.ts.timeline" :class="$style.item" :activeClass="$style.active" to="/"  exact>
					<i class="ti ti-home ti-fw"></i>
				</MkA>
				<MkA v-tooltip.noDelay.bottom="i18n.ts.search" :class="$style.item" :activeClass="$style.active" to="/search">
					<i class="ti ti-zoom ti-fw"></i>
				</MkA>
				<MkA v-tooltip.noDelay.bottom="i18n.ts.settings" :class="$style.item" :activeClass="$style.active" to="/settings">
					<i class="ti ti-settings ti-fw"></i>
				</MkA>
				<MkA v-if="$i?.isAdmin || $i?.isModerator" v-tooltip.noDelay.bottom="i18n.ts.controlPanel" :class="$style.item" :activeClass="$style.active" to="/admin">
					<i class="ti ti-dashboard ti-fw"></i>
				</MkA>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { openInstanceMenu } from '@/ui/_common_/common.js';
import * as os from '@/os.js';
import { navbarItemDef } from '@/navbar.js';
import { $i, openAccountMenu as openAccountMenu_ } from '@/account.js';
import { defaultStore } from '@/store.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { version } from '@/config.js';
import { misskeyApi } from '@/scripts/misskey-api.js';



</script>

<style lang="scss" module>
.root {}

</style>
