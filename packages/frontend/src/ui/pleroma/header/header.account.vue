<template>
	<div>
		<button>
			<MkAvatar :user="$i" :class="$style.avatar" />
		</button>
	</div>
</template>

<script lang="ts" setup>
import { $i } from '@/account';
import { ref } from 'vue';
import * as Misskey from 'cherrypick-js';


</script>

<style lang="scss" module></style>
