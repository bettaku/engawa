<template>
	<div>
		<FormSection>
			<template #label>{{ i18n.ts.reaction }}</template>
			<div class="_gaps">
				<div>
					<div>
						<div>
							<Sortable>
								<template #item="{element}">
									<button class="_button">
										<MkCustomEmoji v-if="element[0] === ':'" :name="element" :normal="true" :fallbackToImage="true" />
										<MkEmoji v-else :emoji="element" :normal="true" />
									</button>
								</template>
								<template #footer>
									<button class="_button">
										<i class="ti ti-plus"></i>
									</button>
								</template>
							</Sortable>
						</div>
						<div>{{ i18n.ts.reactionSettingDescription2 }}</div>
					</div>

					<div class="_buttons">
						<MkButton inline><i class="ti ti-eye"></i>{{ i18n.ts.preview }}</MkButton>
					</div>
				</div>
			</div>
		</FormSection>
	</div>
</template>

<script lang="ts" setup>
import { computed, ref, Ref, watch } from 'vue';
import Sortable from 'vuedraggable';
import MkRadios from '@/components/MkRadios.vue';
import MkButton from '@/components/MkButton.vue';
import FormSection from '@/components/form/section.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import * as os from '@/os.js';
import { defaultStore } from '@/store.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { deepClone } from '@/scripts/clone.js';
import { reactionPicker } from '@/scripts/reaction-picker.js';
import { emojiPicker } from '@/scripts/emoji-picker.js';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import MkEmoji from '@/components/global/MkEmoji.vue';
import MkFolder from '@/components/MkFolder.vue';

</script>

<style lang="scss" scoped></style>
