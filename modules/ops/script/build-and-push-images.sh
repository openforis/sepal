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

# Each operation's complete output, which Jenkins archives with the build
export BUILD_LOGS=${WORKSPACE:?}/build-logs
source "${WORKSPACE}/ci/console.sh"

function build {
  logged "$1" build compose "$1" build
  tests run "$1"
}

# The test helper, unless this build skips tests
function tests {
  if [[ ${SKIP_TESTS:-true} != true ]]; then
    "${TESTS}" "$@"
  fi
}

function push {
  logged "$1" push publish "$1"
}

function start {
  logged "$1" start compose "$1" up -d
}

function restart {
  logged "$1" restart recompose "$1"
}

# module arguments... → Compose for the module, from its directory
function compose {
  cd "${WORKSPACE}/modules/$1" && BUILD_NUMBER=${SEPAL_VERSION} GIT_COMMIT=${GIT_COMMIT} \
    docker compose --file "${WORKSPACE}/modules/$1/docker-compose.yml" "${@:2}"
}

function recompose {
  compose "$1" down && compose "$1" up -d
}

function publish {
  docker push "${DOCKER_REGISTRY_HOST}/openforis/$1:${SEPAL_VERSION}" && verify "$1"
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
    "${REGISTRY_API_URL}/v2/openforis/${MODULE}/manifests/${SEPAL_VERSION}") || return
  SERVED=$(tr -d '\r' <<< "${HEADERS}" | awk 'tolower($1) == "docker-content-digest:" {print $2}')
  DIGESTS=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "${IMAGE}:${SEPAL_VERSION}")
  if ! grep -qxF "${IMAGE}@${SERVED}" <<< "${DIGESTS}"; then
    echo "The registry does not serve ${IMAGE}:${SEPAL_VERSION} as built (registry digest: ${SERVED:-none})"
    return 1
  fi
}

function registry_login {
  echo "${DOCKER_REGISTRY_PASSWORD}" | docker login "${DOCKER_REGISTRY_HOST}" -u "${DOCKER_REGISTRY_USERNAME}" --password-stdin
}

# Keeps the logs of the test services, then removes what the build leaves behind
function clean_up {
  "${TESTS}" service-logs || warn "cannot keep the logs of the test services"
  logged tests cleanup "${TESTS}" clean "${CI_IMAGES[@]}"
}

rm -rf "${BUILD_LOGS}"
# A failed or cancelled build exits through cleanup; the next build's cleanup removes what a killed one left
trap 'stop_progress; clean_up' EXIT
logged leftovers cleanup "${TESTS}" clean "${CI_IMAGES[@]}"

if [[ ${SKIP_TESTS:-true} == true ]]; then
  warn "SKIP_TESTS: pushing untested images; this job's test record stays as it is"
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
build postgres-backup
build postgres
# The shared library's suite needs MySQL and Postgres
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
build scene
# The longest build, once the suites that can fail before it have passed
build sandbox

tests complete

logged registry login registry_login

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
push postgres
push pgadmin
push postgres-backup
push gee
push gateway
push ssh-gateway
push sandbox
push task
push task-manager
push terminal
push caddy
push scene-metadata
push scene

logged registry logout docker logout "${DOCKER_REGISTRY_HOST}"

clean_up
trap - EXIT
tests record
