#!/usr/bin/env bash
set -e

export SEPAL_VERSION=$1
export SEPAL_DATA_DIR=/data
export SEPAL_BACKUP_DIR=/tmp/sepal-backup
export DEPLOY_ENVIRONMENT=OPS
export DOCKER_BUILDKIT=1 
# The Compose project of every test container, network, volume and image of Jenkins builds
export TEST_PROJECT=sepal-jenkins-tests
# The suites and images this job last tested successfully
export TEST_RECORD=${JENKINS_HOME}/sepal-tests/${JOB_NAME}
TESTS=${WORKSPACE}/ci/test-images.sh
# What builds leave behind; cleanup removes the images no container uses
CI_IMAGES=("${DOCKER_REGISTRY_HOST}/openforis/*" openforis/sandbox-base)

function build {
  local MODULE=$1
  local MODULE_DIR=${WORKSPACE}/modules/${MODULE}
  echo
  echo "******* Building ${MODULE} *******"
  cd ${MODULE_DIR}
  set -o pipefail
  BUILD_NUMBER=${SEPAL_VERSION} GIT_COMMIT=${GIT_COMMIT} docker compose --file ${MODULE_DIR}/docker-compose.yml build | tee /var/log/sepal-build/${MODULE}.log
  tests run "${MODULE}"
}

# The test helper, unless this build skips tests
function tests {
  if [[ ${SKIP_TESTS:-false} != true ]]; then
    "${TESTS}" "$@"
  fi
}

function push {
  local MODULE=$1
  echo
  echo "******* Pushing ${MODULE} *******"
  docker push "${DOCKER_REGISTRY_HOST}/openforis/${MODULE}:${SEPAL_VERSION}"
  verify "${MODULE}"
}

# The registry must serve the very image this build made under its tag
function verify {
  local MODULE=$1
  local IMAGE="${DOCKER_REGISTRY_HOST}/openforis/${MODULE}"
  local HEADERS DIGESTS SERVED
  HEADERS=$(curl --fail --silent --show-error --head \
    --header "Accept: application/vnd.docker.distribution.manifest.v2+json" \
    --header "Accept: application/vnd.docker.distribution.manifest.list.v2+json" \
    --header "Accept: application/vnd.oci.image.manifest.v1+json" \
    --header "Accept: application/vnd.oci.image.index.v1+json" \
    "${REGISTRY_API_URL}/v2/openforis/${MODULE}/manifests/${SEPAL_VERSION}")
  SERVED=$(tr -d '\r' <<< "${HEADERS}" | awk 'tolower($1) == "docker-content-digest:" {print $2}')
  DIGESTS=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "${IMAGE}:${SEPAL_VERSION}")
  if ! grep -qxF "${IMAGE}@${SERVED}" <<< "${DIGESTS}"; then
    echo "The registry does not serve ${IMAGE}:${SEPAL_VERSION} as built (registry digest: ${SERVED:-none})"
    return 1
  fi
}

function start {
  local MODULE=$1
  local MODULE_DIR=${WORKSPACE}/modules/${MODULE}
  echo
  echo "******* Starting ${MODULE} *******"
  cd ${MODULE_DIR}
  docker compose --file ${MODULE_DIR}/docker-compose.yml up -d
}

function restart {
  local MODULE=$1
  local MODULE_DIR=${WORKSPACE}/modules/${MODULE}
  echo
  echo "******* Restarting ${MODULE} *******"
  cd ${MODULE_DIR}
  docker compose --file ${MODULE_DIR}/docker-compose.yml down
  docker compose --file ${MODULE_DIR}/docker-compose.yml up -d
}

# A failed or cancelled build exits through cleanup; the next build's cleanup removes what a killed one left
trap '"${TESTS}" clean "${CI_IMAGES[@]}"' EXIT
"${TESTS}" clean "${CI_IMAGES[@]}"

if [[ ${SKIP_TESTS:-false} == true ]]; then
  echo
  echo "******* SKIP_TESTS: pushing untested images; this job's test record stays as it is *******"
fi
tests begin
# The checks that need no image of this build
tests run lib-python-shared deploy-scripts shell

start logger

build sandbox-base

build r-proxy
restart r-proxy

build email
build caddy
build rabbitmq
build backup
build mysql-backup
build mysql
# The shared library's suite needs MySQL
tests run lib-js-shared
build gateway
build terminal
build ssh-gateway
build task
build task-manager
build gee
build user
build storage
build user-storage-backup
build user-assets
build user-files
build message
build recipe
build budget
build worker
build gui
build ceo-gateway
build app-launcher
build app-manager
build scene-metadata
# The longest build, once the suites that can fail before it have passed
build sandbox

tests complete

echo "${DOCKER_REGISTRY_PASSWORD}" | docker login "${DOCKER_REGISTRY_HOST}" -u "${DOCKER_REGISTRY_USERNAME}" --password-stdin

push logger
push email
push backup
push rabbitmq
push user
push storage
push user-storage-backup
push app-launcher
push app-manager
push user-assets
push user-files
push message
push recipe
push budget
push worker
push gui
push ceo-gateway
push mysql
push mysql-backup
push gee
push gateway
push ssh-gateway
push sandbox
push task
push task-manager
push terminal
push caddy
push scene-metadata

docker logout "${DOCKER_REGISTRY_HOST}"

"${TESTS}" clean "${CI_IMAGES[@]}"
trap - EXIT
tests record
