#!/bin/sh

export LLM_PROVIDER="lmstudio"
export LLM_API_KEY="none"
export LLM_MODEL="qwen/qwen3.5-9b"
# export LLM_MODEL="unsloth/glm-4.7-flash"
# export LLM_BASE_URL="http://host.docker.internal:1235"
export LLM_BASE_URL="http://llmster:1234/v1"

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || npm install
  NODE_TLS_REJECT_UNAUTHORIZED=0 exec nodemon \
    --watch "${MODULE}"/src \
    --watch "${MODULE}/config" \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9229 \
    src/main.js \
    --sepal-endpoint "$SEPAL_ENDPOINT" \
    --gee-endpoint "$GEE_ENDPOINT" \
    --llm-provider "$LLM_PROVIDER" \
    --llm-api-key "$LLM_API_KEY" \
    --llm-model "$LLM_MODEL" \
    ${LLM_BASE_URL:+--llm-base-url "$LLM_BASE_URL"}
else
  echo "Starting node"
  exec node \
    src/main.js \
    --sepal-endpoint "$SEPAL_ENDPOINT" \
    --gee-endpoint "$GEE_ENDPOINT" \
    --llm-provider "$LLM_PROVIDER" \
    --llm-api-key "$LLM_API_KEY" \
    --llm-model "$LLM_MODEL" \
    ${LLM_BASE_URL:+--llm-base-url "$LLM_BASE_URL"}
fi
