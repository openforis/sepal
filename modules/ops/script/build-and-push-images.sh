#!/usr/bin/env bash
# Builds, tests and pushes SEPAL's images as Jenkins jobs run it: build-and-push-images.sh version [--clean]
# A clean build rebuilds every layer on the latest base images, runs every test suite and empties the R package caches.
set -e

function usage {
  echo "Usage: $0 version [--clean]" >&2
  exit 2
}

# Before anything changes; the version is an image tag
[[ ${1:-} =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || usage
CLEAN=''
for option in "${@:2}"; do
  [[ ${option} == --clean ]] || usage
  CLEAN=true
done
export CLEAN

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
# The modules built on openforis/sandbox-base, which only this host has: clean builds cannot pull their base image
export LOCAL_BASE="r-proxy app-manager sandbox"
# The R package caches a clean build empties, as "service type source target" of the mounts of r-proxy and
# r-proxy-redis: the package repository, the installed packages and the build queue
R_CACHES=(
  "r-proxy bind ${SEPAL_DATA_DIR}/r-proxy/repo /R"
  "r-proxy bind ${SEPAL_DATA_DIR}/r-proxy/site-library /usr/local/lib/R/site-library"
  "r-proxy-redis bind ${SEPAL_DATA_DIR}/r-proxy-redis /data"
)

# Each operation's complete output, which Jenkins archives with the build
export BUILD_LOGS=${WORKSPACE:?}/build-logs/${BUILD_NUMBER:-$SEPAL_VERSION}
source "${WORKSPACE}/ci/console.sh"

function build {
  local options=()
  if [[ -n ${CLEAN} ]]; then
    options=(--no-cache)
    [[ " ${LOCAL_BASE} " == *" $1 "* ]] || options+=(--pull)
  fi
  if [[ -n ${CLEAN} && ${SKIP_TESTS:-true} != true ]]; then
    logged "$1" build env BUILD_NUMBER="${SEPAL_VERSION}" GIT_COMMIT="${GIT_COMMIT}" \
      "${TESTS}" build-module "$1" "${options[@]}"
  else
    logged "$1" build compose "$1" build "${options[@]}"
  fi
  TEST_IMAGE_BUILT=${CLEAN} tests run "$1"
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

# Stops r-proxy and r-proxy-redis, empties their caches, then starts them and waits until they are ready. The emptied
# mounts are those of the containers that start.
function reset_r_caches {
  compose r-proxy down && compose r-proxy create && check_r_caches && empty_r_caches \
    && compose r-proxy up --detach --wait
}

# The containers must mount the caches and nothing else, since emptying them mounts all their mounts
function check_r_caches {
  local service='{{index $.Config.Labels "com.docker.compose.service"}}' mounts expected
  mounts=$(docker inspect --format "{{range .Mounts}}${service} {{.Type}} {{.Source}} {{.Destination}}{{println}}{{end}}" \
    r-proxy r-proxy-redis | grep . | sort)
  expected=$(printf '%s\n' "${R_CACHES[@]}" | sort)
  if [[ ${mounts} != "${expected}" ]]; then
    printf '%s\n' "Not emptying the R package caches: r-proxy and r-proxy-redis mount" "${mounts}" "instead of" "${expected}"
    return 1
  fi
}

# Deletes everything in the caches but the cache directories themselves. --init passes a cancellation on to find.
function empty_r_caches {
  local cache targets=()
  for cache in "${R_CACHES[@]}"; do targets+=("${cache##* }"); done
  docker run --rm --init --name sepal-r-cache-reset --label org.openforis.sepal.r-cache-reset=true \
    --network none --user 0 --volumes-from r-proxy --volumes-from r-proxy-redis \
    --entrypoint find "${DOCKER_REGISTRY_HOST}/openforis/r-proxy:${SEPAL_VERSION}" "${targets[@]}" -xdev -mindepth 1 -delete
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

rm -rf "${WORKSPACE}/build-logs"
mkdir -p "${BUILD_LOGS}"
if [[ -n ${JOB_URL:-} ]]; then
  echo "Live logs (archived at build end): ${JOB_URL}ws/${BUILD_LOGS#"$WORKSPACE"/}/"
fi
# A failed or cancelled build exits through cleanup; the next build's cleanup removes what a killed one left
trap 'stop_progress; clean_up' EXIT
logged leftovers cleanup "${TESTS}" clean "${CI_IMAGES[@]}"

if [[ ${SKIP_TESTS:-true} == true ]]; then
  warn "SKIP_TESTS: pushing untested images; this job's test record stays as it is"
fi
tests begin
# The checks that need no image of this build
tests run lib-python-shared deploy-scripts shell

build logger
start logger

build sandbox-base

build r-proxy
# A clean build starts r-proxy with empty package caches
if [[ -n ${CLEAN} ]]; then
  logged r-proxy "cache reset" reset_r_caches
else
  restart r-proxy
fi

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
push gee
push gateway
push ssh-gateway
push sandbox
push task
push task-manager
push terminal
push caddy
push scene-metadata

logged registry logout docker logout "${DOCKER_REGISTRY_HOST}"

clean_up
trap - EXIT
tests record
