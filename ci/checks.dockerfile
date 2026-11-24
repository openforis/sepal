# The test images of the ci/tests.yml suites that no module image holds, one target each
FROM node:26-trixie AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends gdal-bin python3 python3-gdal shellcheck systemd zstd \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src

FROM base AS lib-js-shared
COPY lib/js/shared lib/js/shared
# The library carries no lock of its own, so it is tested with the one most modules install it from
COPY modules/worker/lib/shared/package-lock.json lib/js/shared/package-lock.json
WORKDIR /src/lib/js/shared
RUN npm ci
CMD ["npm", "test"]

FROM base AS lib-python-shared
COPY lib/python/shared lib/python/shared
CMD ["/usr/bin/python3", "-m", "unittest", "discover", "-s", "lib/python/shared", "-p", "test_*.py", "-v"]

FROM base AS deploy-scripts
COPY hosting-services hosting-services
CMD ["python3", "-m", "unittest", "discover", "-s", "hosting-services/aws/sepal/test", "-p", "*_test.py", "-v"]

FROM base AS shell
COPY bin/deploy bin/deploy
COPY modules/app-manager modules/app-manager
COPY modules/ops/script modules/ops/script
COPY modules/ops/test modules/ops/test
COPY modules/sandbox/script/init_r_packages.sh modules/sandbox/script/init_r_packages.sh
COPY ci ci
# The app-manager suites check permission handling, which root would bypass
USER node
CMD ["ci/shell-checks.sh"]
