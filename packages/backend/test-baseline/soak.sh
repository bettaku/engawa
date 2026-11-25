#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# RUST-02: web を再起動せずに全シナリオを繰り返し流し、その間 master の CPU プロファイルを10分ごとに取る。
# 長く動いたプロセスでだけ起きる張り付き（docs/rust-migration/baseline/README.md §4.3）を再現させるための試験。
#
# 前提: web が compose.prof.yml（インスペクタ付き）で起動していること。
#   docker compose -f compose.yml -f compose.prof.yml up -d web
#
#   ./soak.sh [CYCLES=3] [RATE=50] [DURATION=2m]
#
# 結果: results/soak-<開始時刻>/ にプロファイル（chunk-N.cpuprofile）と、各計測の結果（results/ に通常どおり）。

set -euo pipefail
cd "$(dirname "$0")"

CYCLES=${1:-3}
RATE=${2:-50}
DURATION=${3:-2m}
OUT="results/soak-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

curl -fs http://127.0.0.1:9229/json/list >/dev/null || { echo "inspector not reachable; start web with compose.prof.yml" >&2; exit 1; }

# 10分ごとのプロファイル。soak が終わったら止める
(
	n=1
	while true; do
		start=$(date +%H:%M:%S)
		node prof-capture.mjs --seconds 600 --out "$OUT/chunk-$n.cpuprofile" 2>>"$OUT/capture.log" || break
		printf 'chunk-%s\t%s\t%s\n' "$n" "$start" "$(date +%H:%M:%S)" >> "$OUT/chunks.tsv"
		n=$((n + 1))
	done
) &
capture=$!

scenarios=(emojis_anon meta_anon ltl_anon notes_show_anon users_show_anon htl_auth i_auth notifications_auth mix)
for c in $(seq 1 "$CYCLES"); do
	for s in "${scenarios[@]}"; do
		r=$RATE
		# i/notifications の利用者ごとの制限（small の50人なら 40rps まで）
		[ "$s" = notifications_auth ] && r=25
		printf '%s\tcycle %s\t%s\t%s\n' "$(date +%H:%M:%S)" "$c" "$s" "$r" >> "$OUT/timeline.tsv"
		./run.sh measure "$s" "$r" "$DURATION" warm 2>&1 | tail -1 | tee -a "$OUT/runs.log"
	done
done

# 最後の区切りまで取り終えるのを待たず、取得中のプロファイルは捨てる
kill "$capture" 2>/dev/null || true
pkill -f "prof-capture.mjs --seconds 600 --out $OUT" 2>/dev/null || true
echo "soak done: $OUT" >&2
