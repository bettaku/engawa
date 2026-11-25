#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# RUST-02: 基準負荷の計測。使い方は README.md を参照する。
#
#   ./run.sh build                      現在のコミットから計測用イメージを作る
#   ./run.sh seed [small|medium|large]  空のDBにAPIでデータを投入し、スナップショットを取る
#   ./run.sh restore [scale]            スナップショットから戻し、productionで起動する
#   ./run.sh measure SCENARIO RATE [DURATION] [warm|cold]
#   ./run.sh matrix [RATES...]          全シナリオを複数の到着率で計測する
#   ./run.sh down                       止めてボリュームを消す

set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] && set -a && . ./.env && set +a

COMPOSE=(docker compose -f compose.yml)
REPO_ROOT=$(git rev-parse --show-toplevel)
SHA=$(git rev-parse --short HEAD)
IMAGE=${BASELINE_WEB_IMAGE:-engawa-baseline:local}
export BASELINE_WEB_IMAGE=$IMAGE
SAMPLE_INTERVAL=${BASELINE_SAMPLE_INTERVAL:-1}

IDLE_SECONDS=${BASELINE_IDLE_SECONDS:-10}

mkdir -p results snapshots fixture

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }

cid() { "${COMPOSE[@]}" ps -q "$1"; }

wait_healthy() {
	log "waiting for web"
	for _ in $(seq 1 180); do
		if curl -fso /dev/null "http://127.0.0.1:${BASELINE_WEB_PORT:-61900}/healthz"; then return 0; fi
		sleep 1
	done
	log "web did not become healthy"; "${COMPOSE[@]}" logs --tail 50 web; exit 1
}

cmd_build() {
	log "building $IMAGE from $SHA"
	docker build -t "$IMAGE" -t "engawa-baseline:$SHA" "$REPO_ROOT"
}

cmd_down() {
	"${COMPOSE[@]}" --profile tools down -v --remove-orphans
}

cmd_seed() {
	local scale=${1:-small}
	cmd_down
	log "starting in development mode for seeding (rate limit off)"
	BASELINE_NODE_ENV=development "${COMPOSE[@]}" up -d web
	wait_healthy
	node seed.mjs --url "http://127.0.0.1:${BASELINE_WEB_PORT:-61900}" --scale "$scale" --seed "${BASELINE_SEED:-1}"
	log "waiting for queues to drain"
	sleep 20
	"${COMPOSE[@]}" stop web
	log "taking snapshot snapshots/$scale.dump"
	docker exec "$(cid db)" pg_dump -U engawa -d engawa -Fc -f "/snapshots/$scale.dump"
	cp fixture/fixture.json "snapshots/$scale.fixture.json"
	{
		echo "commit=$SHA"
		echo "image=$(docker image inspect "$IMAGE" --format '{{.Id}}')"
		echo "scale=$scale"
		echo "seed=${BASELINE_SEED:-1}"
		echo "takenAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	} > "snapshots/$scale.meta"
	cmd_restore "$scale"
}

cmd_restore() {
	local scale=${1:-small}
	[ -f "snapshots/$scale.dump" ] || { log "no snapshot for $scale; run ./run.sh seed $scale"; exit 1; }
	cmd_down
	"${COMPOSE[@]}" up -d db redis
	sleep 2
	log "restoring snapshots/$scale.dump"
	docker exec "$(cid db)" pg_restore -U engawa -d engawa --no-owner "/snapshots/$scale.dump"
	docker exec "$(cid db)" psql -U engawa -d engawa -qc 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements' >/dev/null
	cp "snapshots/$scale.fixture.json" fixture/fixture.json
	echo "$scale" > fixture/scale
	BASELINE_NODE_ENV=production "${COMPOSE[@]}" up -d web
	wait_healthy
}

run_k6() {
	local scenario=$1 rate=$2 duration=$3 name=$4
	"${COMPOSE[@]}" run --rm --no-deps -q \
		-e SCENARIO="$scenario" -e RATE="$rate" -e DURATION="$duration" -e WARMUP=0s -e RUN_NAME="$name" \
		k6 run --quiet /scripts/baseline.js
}

cmd_measure() {
	local scenario=$1 rate=$2 duration=${3:-60s} cache=${4:-warm}
	local scale; scale=$(cat fixture/scale 2>/dev/null || echo unknown)
	local name="${SHA}-${scale}-${scenario}-${rate}rps-${cache}"
	# 同じ条件の繰り返しは上書きせず、-2, -3 ... を付けて残す
	if [ -e "results/${name}.json" ]; then
		local n=2
		while [ -e "results/${name}-${n}.json" ]; do n=$((n + 1)); done
		name="${name}-${n}"
	fi
	local web db redis
	web=$(cid web); db=$(cid db); redis=$(cid redis)

	if [ "$cache" = cold ]; then
		# プロセス内のキャッシュ、Redisの値、PostgreSQLの共有バッファを空にする。
		# DockerのVMのページキャッシュは残るので、DBのディスク読み込みまでは再現しない（READMEの制約を参照）
		log "cold: restarting web, db, redis"
		"${COMPOSE[@]}" restart db redis >/dev/null
		"${COMPOSE[@]}" restart web >/dev/null
		wait_healthy
		web=$(cid web); db=$(cid db); redis=$(cid redis)
	else
		log "warm-up: $scenario at $rate rps for ${BASELINE_WARMUP:-20s}"
		run_k6 "$scenario" "$rate" "${BASELINE_WARMUP:-20s}" "${name}.warmup" >/dev/null
	fi

	docker exec "$db" psql -U engawa -d engawa -qtc 'SELECT pg_stat_statements_reset()' >/dev/null

	local samples="results/${name}.samples.tsv"
	printf 'ts\tlabel\tcontainer\tcpu_usec\tanon_bytes\n' > "$samples"
	"${COMPOSE[@]}" --profile tools up -d sampler >/dev/null 2>&1
	local sampler_id; sampler_id=$("${COMPOSE[@]}" --profile tools ps -q sampler)
	local targets=("web=$web" "db=$db" "redis=$redis")
	# sample LABEL: 区間の境界を記録する。途中の推移は sampler の中の loop が bg として記録する
	sample() { docker exec "$sampler_id" sh /sampler.sh once "$1" "/results/${name}.samples.tsv" "${targets[@]}"; }

	# 負荷のない状態のCPU使用量（定期処理など）を測り、後で差し引けるようにする
	log "idle: ${IDLE_SECONDS}s"
	sample idle_start; sleep "$IDLE_SECONDS"; sample idle_end

	log "measure: $scenario at $rate rps for $duration ($cache)"
	local log_since; log_since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
	sample measure_start
	docker exec -d "$sampler_id" sh /sampler.sh loop "$SAMPLE_INTERVAL" "/results/${name}.samples.tsv" "${targets[@]}"
	local k6_status=0
	run_k6 "$scenario" "$rate" "$duration" "$name" || k6_status=$?
	docker exec "$sampler_id" pkill -f 'sampler.sh loop' || true
	sample measure_end
	# 計測区間の web のログ。異常値が出たときに、その間に何が動いていたかを追うために残す
	docker logs --since "$log_since" "$web" > "results/${name}.web.log" 2>&1 || true

	# 計測後の待機時の CPU。cold では計測前の待機区間に起動処理が入るので、こちらを差し引く
	sleep 2
	sample idle_after_start; sleep "$IDLE_SECONDS"; sample idle_after_end
	[ "$k6_status" -eq 0 ] || { log "k6 failed ($k6_status)"; exit 1; }

	# web コンテナの中のプロセスごとの RSS（現在値と最大値）。cgroup の anon には pnpm の起動ラッパーも含まれるため分けて残す
	docker exec "$web" sh -c 'for p in /proc/[0-9]*; do
		[ -r "$p/status" ] && [ "${p#/proc/}" != "$$" ] || continue
		rss=$(awk "/^VmRSS/{print \$2}" "$p/status"); hwm=$(awk "/^VmHWM/{print \$2}" "$p/status")
		[ -n "$rss" ] || continue
		printf "%s\t%s\t%s\n" "$rss" "$hwm" "$(tr "\0" " " < "$p/cmdline" | cut -c1-80)"
	done' > "results/${name}.procs.tsv" || true

	docker exec "$db" psql -U engawa -d engawa -qAt -F $'\t' -c "
		SELECT calls, round(total_exec_time::numeric, 3), round(mean_exec_time::numeric, 4), rows,
			shared_blks_hit, shared_blks_read, regexp_replace(left(query, 300), '\s+', ' ', 'g')
		FROM pg_stat_statements
		WHERE dbid = (SELECT oid FROM pg_database WHERE datname = 'engawa')
		ORDER BY total_exec_time DESC LIMIT 40" > "results/${name}.pgss.tsv"

	{
		echo "commit=$SHA"
		echo "image=$(docker image inspect "$IMAGE" --format '{{.Id}}')"
		echo "scale=$scale"
		echo "cache=$cache"
		echo "webCpus=${BASELINE_WEB_CPUS:-2}"
		echo "webMem=${BASELINE_WEB_MEM:-2g}"
		echo "dbCpus=${BASELINE_DB_CPUS:-2}"
		echo "host=$(uname -sm)"
		echo "dockerCpus=$(docker info --format '{{.NCPU}}')"
		echo "dockerMem=$(docker info --format '{{.MemTotal}}')"
	} > "results/${name}.env"

	node summarize.mjs "results/${name}"
}

# 到着率ごとに BASELINE_REPEAT 回（既定3）測る。比較に使う到着率（BASELINE_MAIN_RATE、既定50）以外は
# BASELINE_SIDE_REPEAT 回（既定1）にして、全体の時間を抑える
cmd_matrix() {
	local rates=("$@")
	[ ${#rates[@]} -eq 0 ] && rates=(25 50 100)
	local main_rate=${BASELINE_MAIN_RATE:-50} repeat=${BASELINE_REPEAT:-3} side_repeat=${BASELINE_SIDE_REPEAT:-1}
	local scenarios=(emojis_anon meta_anon ltl_anon notes_show_anon users_show_anon htl_auth i_auth notifications_auth mix)
	local users; users=$(node -e 'console.log(require("./fixture/fixture.json").users.length)')
	for s in "${scenarios[@]}"; do
		for r in "${rates[@]}"; do
			# i/notifications は利用者ごとに 1回/秒 の制限がある。k6 と同じく 80% を上限にする
			if [ "$s" = notifications_auth ] && [ $((r * 10)) -gt $((users * 8)) ]; then
				log "skip: $s at $r rps exceeds the per-user rate limit with $users users"
				continue
			fi
			local n=$side_repeat
			[ "$r" = "$main_rate" ] && n=$repeat
			for _ in $(seq 1 "$n"); do
				cmd_measure "$s" "$r" "${BASELINE_DURATION:-60s}" warm
			done
		done
	done
	for _ in $(seq 1 "$repeat"); do
		cmd_measure emojis_anon "$main_rate" "${BASELINE_DURATION:-60s}" cold
		cmd_measure mix "$main_rate" "${BASELINE_DURATION:-60s}" cold
	done
	node summarize.mjs --table results
}

case "${1:-}" in
	build) shift; cmd_build "$@" ;;
	seed) shift; cmd_seed "$@" ;;
	restore) shift; cmd_restore "$@" ;;
	measure) shift; cmd_measure "$@" ;;
	matrix) shift; cmd_matrix "$@" ;;
	down) shift; cmd_down ;;
	*) sed -n '3,11p' "$0"; exit 1 ;;
esac
