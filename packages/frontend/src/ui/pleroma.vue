<template></template>

<script lang="ts" setup>
import { defineAsyncComponent, provide, onMounted, onBeforeUnmount, ref, watch, shallowRef, Ref, onUnmounted, computed } from 'vue';
import tinycolor from 'tinycolor2';
import type MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import XCommon from '@/ui/_common_/common.vue';
import { instanceName } from '@/config.js';
import XDrawerMenu from '@/ui/friendly/navbar-for-mobile.vue';
import * as os from '@/os.js';
import { defaultStore } from '@/store.js';
import { i18n } from '@/i18n.js';
import { $i, openAccountMenu as openAccountMenu_ } from '@/account.js';
import { PageMetadata, provideMetadataReceiver, provideReactiveMetadata } from '@/scripts/page-metadata.js';
import { deviceKind } from '@/scripts/device-kind.js';
import { miLocalStorage } from '@/local-storage.js';
import { CURRENT_STICKY_BOTTOM } from '@/const.js';
import { useScrollPositionManager } from '@/nirax.js';
import { mainRouter } from '@/router/main.js';
import { globalEvents } from '@/events.js';
import CPAvatar from '@/components/global/CPAvatar-Friendly.vue';

</script>

<style lang="scss" module></style>
