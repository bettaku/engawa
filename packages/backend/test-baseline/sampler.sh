#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# RUST-02: sampler コンテナの中で動き、ホストの cgroup から各コンテナの CPU 時間と匿名メモリを読む。
# 計測対象のコンテナに docker exec を繰り返すと、Docker Desktop の VM に負荷がかかって計測が乱れるため、
# 読み取りはこのコンテナの中だけで行う。時刻は VM の /proc/uptime（秒、10ms単位）。
#
#   sampler.sh once LABEL OUT name=id...   1回記録する
#   sampler.sh loop INTERVAL OUT name=id...   止められるまで記録する（label は bg）

set -eu

row() {
	label=$1; out=$2; shift 2
	ts=$(cut -d' ' -f1 /proc/uptime)
	for pair in "$@"; do
		name=${pair%%=*}; id=${pair#*=}
		cg=/hostcg/docker/$id
		cpu=$(awk '/^usage_usec/{print $2}' "$cg/cpu.stat")
		anon=$(awk '/^anon /{print $2}' "$cg/memory.stat")
		printf '%s\t%s\t%s\t%s\t%s\n' "$ts" "$label" "$name" "$cpu" "$anon" >> "$out"
	done
}

mode=$1; shift
case "$mode" in
	once) label=$1; out=$2; shift 2; row "$label" "$out" "$@" ;;
	loop) interval=$1; out=$2; shift 2; while true; do row bg "$out" "$@"; sleep "$interval"; done ;;
esac
