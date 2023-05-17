#!/bin/sh

export PROMETHEUS_ORIGINAL_CFG=/etc/prometheus/prometheus.yml
export PROMETHEUS_AMENDED_CFG=/etc/prometheus/prometheus-amended.yml

# Copy the original config file into the amended config file
cp ${PROMETHEUS_ORIGINAL_CFG} ${PROMETHEUS_AMENDED_CFG}

# Replace ${TARGET_USERNAME} with value from env variable with the same name
/bin/sed -i "s/\${TARGET_USERNAME}/${TARGET_USERNAME}/" ${PROMETHEUS_AMENDED_CFG}

# Replace ${TARGET_PASSWORD} with value from env variable with the same name
/bin/sed -i "s/\${TARGET_PASSWORD}/${TARGET_PASSWORD}/" ${PROMETHEUS_AMENDED_CFG}

# Replace ${SEPAL_ENDPOINT} with value from env variable with the same name
/bin/sed -i "s|\${SEPAL_HOST}|${SEPAL_HOST}|" ${PROMETHEUS_AMENDED_CFG}

# Run original entrypoint with amended configuration
exec /bin/prometheus $@ --config.file=${PROMETHEUS_AMENDED_CFG}
