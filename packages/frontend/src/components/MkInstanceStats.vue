<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkFoldableSection class="item">
		<template #header>Chart</template>
		<div :class="$style.chart">
			<div class="selects">
				<MkSelect v-model="chartSrc" style="margin: 0; flex: 1;">
					<optgroup :label="i18n.ts.federation">
						<option value="federation">{{ i18n.ts._charts.federation }}</option>
						<option value="ap-request">{{ i18n.ts._charts.apRequest }}</option>
					</optgroup>
					<optgroup :label="i18n.ts.users">
						<option value="users">{{ i18n.ts._charts.usersIncDec }}</option>
						<option value="users-total">{{ i18n.ts._charts.usersTotal }}</option>
						<option value="active-users">{{ i18n.ts._charts.activeUsers }}</option>
					</optgroup>
					<optgroup :label="i18n.ts.notes">
						<option value="notes">{{ i18n.ts._charts.notesIncDec }}</option>
						<option value="local-notes">{{ i18n.ts._charts.localNotesIncDec }}</option>
						<option value="remote-notes">{{ i18n.ts._charts.remoteNotesIncDec }}</option>
						<option value="notes-total">{{ i18n.ts._charts.notesTotal }}</option>
					</optgroup>
					<optgroup :label="i18n.ts.drive">
						<option value="drive-files">{{ i18n.ts._charts.filesIncDec }}</option>
						<option value="drive">{{ i18n.ts._charts.storageUsageIncDec }}</option>
					</optgroup>
				</MkSelect>
				<MkSelect v-model="chartSpan" style="margin: 0 0 0 10px;">
					<option value="hour">{{ i18n.ts.perHour }}</option>
					<option value="day">{{ i18n.ts.perDay }}</option>
				</MkSelect>
			</div>
			<div class="chart _panel">
				<MkChart :src="chartSrc" :span="chartSpan" :limit="chartLimit" :detailed="true"></MkChart>
			</div>
		</div>
	</MkFoldableSection>

	<MkFoldableSection class="item">
		<template #header>Active users heatmap</template>
		<MkSelect v-model="heatmapSrc" style="margin: 0 0 12px 0;">
			<option value="active-users">Active users</option>
			<option value="notes">Notes</option>
			<option value="ap-requests-inbox-received">AP Requests: inboxReceived</option>
			<option value="ap-requests-deliver-succeeded">AP Requests: deliverSucceeded</option>
			<option value="ap-requests-deliver-failed">AP Requests: deliverFailed</option>
		</MkSelect>
		<div class="_panel" :class="$style.heatmap">
			<MkHeatmap :src="heatmapSrc" :label="'Read & Write'"/>
		</div>
	</MkFoldableSection>

	<MkFoldableSection class="item">
		<template #header>Retention rate</template>
		<div class="_panel" :class="$style.retentionHeatmap">
			<MkRetentionHeatmap/>
		</div>
		<div class="_panel" :class="$style.retentionLine">
			<MkRetentionLineChart/>
		</div>
	</MkFoldableSection>

	<MkFoldableSection class="item">
		<template #header>Federation</template>
		<div :class="$style.federation">
			<div class="pies">
				<div class="sub">
					<div class="title">Sub</div>
					<canvas ref="subDoughnutEl"></canvas>
				</div>
				<div class="pub">
					<div class="title">Pub</div>
					<canvas ref="pubDoughnutEl"></canvas>
				</div>
			</div>
			<div class="diffs">
				<div class="item2 _panel sub">
					<div class="icon"><i class="ti ti-world-download"></i></div>
					<div class="body">
						<div class="value">
							{{ number(federationSubActive) }}
							<MkNumberDiff v-tooltip="i18n.ts.dayOverDayChanges" class="diff" :value="federationSubActiveDiff"></MkNumberDiff>
						</div>
						<div class="label">Sub</div>
					</div>
				</div>
				<div class="item2 _panel pub">
					<div class="icon"><i class="ti ti-world-upload"></i></div>
					<div class="body">
						<div class="value">
							{{ number(federationPubActive) }}
							<MkNumberDiff v-tooltip="i18n.ts.dayOverDayChanges" class="diff" :value="federationPubActiveDiff"></MkNumberDiff>
						</div>
						<div class="label">Pub</div>
					</div>
				</div>
			</div>
		</div>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref, shallowRef } from 'vue';
import { Chart } from 'chart.js';
import MkSelect from '@/components/MkSelect.vue';
import MkChart from '@/components/MkChart.vue';
import { useChartTooltip } from '@/scripts/use-chart-tooltip.js';
import * as os from '@/os.js';
import { misskeyApiGet } from '@/scripts/misskey-api.js';
import { i18n } from '@/i18n.js';
import MkHeatmap, { type HeatmapSource } from '@/components/MkHeatmap.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkRetentionHeatmap from '@/components/MkRetentionHeatmap.vue';
import MkRetentionLineChart from '@/components/MkRetentionLineChart.vue';
import { initChart } from '@/scripts/init-chart.js';
import number from '@/filters/number';
import MkNumberDiff from './MkNumberDiff.vue';

initChart();

const chartLimit = 500;
const chartSpan = ref<'hour' | 'day'>('hour');
const chartSrc = ref('active-users');
const heatmapSrc = ref<HeatmapSource>('active-users');
const subDoughnutEl = shallowRef<HTMLCanvasElement>();
const pubDoughnutEl = shallowRef<HTMLCanvasElement>();
const federationPubActive = ref<number | null>(null);
const federationPubActiveDiff = ref<number | null>(null);
const federationSubActive = ref<number | null>(null);
const federationSubActiveDiff = ref<number | null>(null);

const { handler: externalTooltipHandler1 } = useChartTooltip({
	position: 'middle',
});
const { handler: externalTooltipHandler2 } = useChartTooltip({
	position: 'middle',
});

function createDoughnut(chartEl, tooltip, data) {
	const chartInstance = new Chart(chartEl, {
		type: 'doughnut',
		data: {
			labels: data.map(x => x.name),
			datasets: [{
				backgroundColor: data.map(x => x.color),
				borderColor: getComputedStyle(document.documentElement).getPropertyValue('--MI_THEME-panel'),
				borderWidth: 2,
				hoverOffset: 0,
				data: data.map(x => x.value),
			}],
		},
		options: {
			maintainAspectRatio: false,
			layout: {
				padding: {
					left: 16,
					right: 16,
					top: 16,
					bottom: 16,
				},
			},
			onClick: (ev) => {
				if (ev.native == null) return;
				const hit = chartInstance.getElementsAtEventForMode(ev.native, 'nearest', { intersect: true }, false)[0];
				if (hit && data[hit.index].onClick) {
					data[hit.index].onClick();
				}
			},
			plugins: {
				legend: {
					display: false,
				},
				tooltip: {
					enabled: false,
					mode: 'index',
					animation: {
						duration: 0,
					},
					external: tooltip,
				},
			},
		},
	});

	return chartInstance;
}

onMounted(async () => {
	const chart = await misskeyApiGet('charts/federation', { limit: 2, span: 'day' });
	federationPubActive.value = chart.pubActive[0];
	federationPubActiveDiff.value = chart.pubActive[0] - chart.pubActive[1];
	federationSubActive.value = chart.subActive[0];
	federationSubActiveDiff.value = chart.subActive[0] - chart.subActive[1];
})

onMounted(() => {
	misskeyApiGet('federation/stats', { limit: 30 }).then(fedStats => {
		type ChartData = {
			name: string,
			color: string | null,
			value: number,
			onClick?: () => void,
		}[];

		const subs: ChartData = fedStats.topSubInstances.map(x => ({
			name: x.host,
			color: x.themeColor,
			value: x.followersCount,
			onClick: () => {
				os.pageWindow(`/instance-info/${x.host}`);
			},
		}));

		subs.push({
			name: '(other)',
			color: '#80808080',
			value: fedStats.otherFollowersCount,
		});

		createDoughnut(subDoughnutEl.value, externalTooltipHandler1, subs);

		const pubs: ChartData = fedStats.topPubInstances.map(x => ({
			name: x.host,
			color: x.themeColor,
			value: x.followingCount,
			onClick: () => {
				os.pageWindow(`/instance-info/${x.host}`);
			},
		}));

		pubs.push({
			name: '(other)',
			color: '#80808080',
			value: fedStats.otherFollowingCount,
		});

		createDoughnut(pubDoughnutEl.value, externalTooltipHandler2, pubs);
	});
});
</script>

<style lang="scss" module>
.root {
	&:global {
		> .item {
			margin-bottom: 16px;
		}
	}
}

.chart {
	&:global {
		> .selects {
			display: flex;
			margin-bottom: 12px;
		}

		> .chart {
			padding: 16px;
		}
	}
}

.heatmap {
	padding: 16px;
	margin-bottom: 16px;
}

.retentionHeatmap {
	padding: 16px;
	margin-bottom: 16px;
}

.retentionLine {
	padding: 16px;
	margin-bottom: 16px;
}

.federation {
	&:global {
		> .pies {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
			grid-gap: 16px;
			margin-bottom: 16px;

			> .sub, > .pub {
				flex: 1;
				min-width: 0;
				position: relative;
				background: var(--MI_THEME-panel);
				border-radius: var(--MI-radius);
				padding: 24px;
				max-height: 300px;

				> .title {
					position: absolute;
					top: 24px;
					left: 24px;
				}
			}
			@media (max-width: 600px) {
				flex-direction: column;
			}
		}
		> .diffs {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
			grid-gap:16px;
			position: relative;
			margin-top: 8px;

			> .item2 {
				display: flex;
				box-sizing: border-box;
				padding: 12px;
				position: relative;

				> .icon {
					display: grid;
					place-items: center;
					height: 100%;
					aspect-ratio: 1;
					margin-right: 12px;
					background: var(--accentedBg);
					color: var(--accent);
					border-radius: 10px;
				}

				&.sub {
					> .icon {
						background: #d5ba0026;
						color: #dfc300;
					}
				}

				&.pub {
					> .icon {
						background: #00cf2326;
						color: #00cd5b;
					}
				}

				> .body {
					padding: 2px 0;

					> .value {
						font-size: 1.2em;
						font-weight: bold;

						> .diff {
							font-size: 0.65em;
							font-weight: normal;
						}
					}

					> .label {
						font-size: 0.8em;
						opacity: 0.5;
					}
				}
			}

		}
	}
}
</style>
