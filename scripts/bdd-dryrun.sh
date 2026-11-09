#!/usr/bin/env bash
# BDD 試跑：只檢查「有沒有缺 step／缺情境／缺 steps 檔」，不管測試紅綠。
# vitest-cucumber 沒有 dry-run 模式，缺 step 與缺情境會在載入時拋錯，
# 因此跑一次測試再從輸出判斷；沒有 steps 檔的 .feature 根本不會被載入，要另外檢查。
set -u
cd "$(dirname "$0")/.."
missing=0
for f in features/*.feature; do
  b=$(basename "$f" .feature)
  if [ ! -f "tests/steps/$b.steps.ts" ]; then
    echo "缺 steps 檔：$f → tests/steps/$b.steps.ts"; missing=1
  fi
done
out=$(npx vitest run --no-color 2>&1)
if echo "$out" | grep -qE "Missing steps|NotCalledError|StepAbleUnknowStepError|FeatureUknowScenarioError|ItemAlreadyExistsError|ScenarioOutlineVariableNotCalledInStepsError"; then
  echo "$out" | grep -E -A4 "Missing steps|NotCalledError|StepAbleUnknowStepError|FeatureUknowScenarioError|ItemAlreadyExistsError|ScenarioOutlineVariableNotCalledInStepsError"
  missing=1
fi
exit $missing
