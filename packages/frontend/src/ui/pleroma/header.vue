<template>
	<div :class="$style.root">
		<div :class="$style.body">
			<div :class="$style.left"></div>
			<div :class="$style.center"></div>
			<div :class="$style.right"></div>
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
