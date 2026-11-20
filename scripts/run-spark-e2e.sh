#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  android|ios) ;;
  *)
    echo 'Usage: ./scripts/run-spark-e2e.sh {android|ios}' >&2
    exit 2
    ;;
esac

cd "$(dirname "$0")/.."
./scripts/local-backend path >/dev/null
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:23090/api/blocks/tip/height >/dev/null
if [[ "$1" == android ]]; then
  for port in 23535 23536 23537 23049 23090; do
    adb reverse "tcp:$port" "tcp:$port"
  done
fi

# Each dedicated run must execute the payment even on a reused runner.
exec ./scripts/local-backend run env -u CI BITKIT_LOCAL_SPARK=1 "./ci_run_$1.sh" \
  --spec ./test/specs/spark.e2e.ts --mochaOpts.grep '@spark_1\b'
