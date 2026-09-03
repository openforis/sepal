import {Command, Option} from 'commander'

import {getLogger} from '#sepal/log'

const log = getLogger('config')

const DEFAULT_HTTP_PORT = 80
const DEFAULT_HOSTING_SERVICE = 'local'
const DEFAULT_SEPAL_HTTPS_PORT = 443
const DEFAULT_DOCKER_PORT = 2375
const DEFAULT_RABBITMQ_PORT = 5672
const DEFAULT_WORKER_PORT = 8080

const program = new Command()

program
    // ─── HTTP ───────────────────────────────────────────────────────────────
    .addOption(
        new Option('--port <number>', 'HTTP listen port')
            .env('HTTP_PORT')
            .argParser(v => parseInt(v))
            .default(DEFAULT_HTTP_PORT)
    )

    // ─── Hosting service ────────────────────────────────────────────────────
    .addOption(
        new Option('--hosting-service <name>', 'Hosting service provider: aws | local')
            .env('HOSTING_SERVICE')
            .choices(['aws', 'local'])
            .default(DEFAULT_HOSTING_SERVICE)
    )

    // ─── SEPAL creds / host ─────────────────────────────────────────────────
    .addOption(
        new Option('--sepal-version <string>', 'Deployed SEPAL version (e.g. 1.23.4)')
            .env('SEPAL_VERSION')
    )
    .addOption(
        new Option('--sepal-user <string>', 'SEPAL service username for inter-service calls')
            .env('SEPAL_USER')
    )
    .addOption(
        new Option('--sepal-password <string>', 'SEPAL service password for inter-service calls')
            .env('SEPAL_PASSWORD')
    )
    .addOption(
        new Option('--sepal-host <string>', 'SEPAL hostname (internal, e.g. sepal)')
            .env('SEPAL_HOST')
    )
    .addOption(
        new Option('--sepal-https-port <number>', 'SEPAL HTTPS port (default 443)')
            .env('SEPAL_HTTPS_PORT')
            .argParser(v => parseInt(v))
            .default(DEFAULT_SEPAL_HTTPS_PORT)
    )
    .addOption(
        new Option('--sepal-host-data-dir <path>', 'Host path to /data (mounted into sandbox containers)')
            .env('SEPAL_HOST_DATA_DIR')
    )
    .addOption(
        new Option('--sepal-host-project-dir <path>', 'Host path to SEPAL project source (DEV only, optional)')
            .env('SEPAL_HOST_PROJECT_DIR')
    )

    // ─── Task executor ──────────────────────────────────────────────────────
    .addOption(
        new Option('--worker-port <number>', 'Task-executor HTTP port on sandbox containers (default 8080)')
            .env('WORKER_PORT')
            .argParser(v => parseInt(v))
            .default(DEFAULT_WORKER_PORT)
    )

    // ─── Instance usage monitoring ──────────────────────────────────────────
    .addOption(
        new Option('--usage-sampling-interval-seconds <number>', 'Instance usage sampling interval (default 60)')
            .env('USAGE_SAMPLING_INTERVAL_SECONDS')
            .argParser(v => parseInt(v))
            .default(60)
    )
    .addOption(
        new Option('--usage-sample-retention-days <number>', 'Raw usage sample retention (default 30)')
            .env('USAGE_SAMPLE_RETENTION_DAYS')
            .argParser(v => parseInt(v))
            .default(30)
    )
    .addOption(
        new Option('--usage-hourly-retention-days <number>', 'Hourly usage rollup retention (default 365)')
            .env('USAGE_HOURLY_RETENTION_DAYS')
            .argParser(v => parseInt(v))
            .default(365)
    )

    // ─── Session expiration (docs/session-expiration-model.md) ──────────────
    // Defaults are deliberately generous where a mistake costs a user their work. They should be
    // tightened from production data, not loosened from complaints.
    .addOption(
        new Option('--session-expiry-mode <mode>', 'off | notify | enforce — notify runs the full UX without closing anything')
            .env('SESSION_EXPIRY_MODE')
            .choices(['off', 'notify', 'enforce'])
            .default('off')
    )
    .addOption(
        new Option('--startup-lease-minutes <number>', 'Initial deadline on session request, re-ratcheted on activation (default 30)')
            .env('STARTUP_LEASE_MINUTES')
            .argParser(v => parseInt(v))
            .default(30)
    )
    .addOption(
        new Option('--open-extension-minutes <number>', 'Extension when an app or terminal is opened (default 15)')
            .env('OPEN_EXTENSION_MINUTES')
            .argParser(v => parseInt(v))
            .default(15)
    )
    .addOption(
        new Option('--interaction-extension-minutes <number>', 'Extension per attributed human interaction (default 15)')
            .env('INTERACTION_EXTENSION_MINUTES')
            .argParser(v => parseInt(v))
            .default(15)
    )
    .addOption(
        new Option('--busy-extension-minutes <number>', 'Extension per busy verdict from the sampler (default 15)')
            .env('BUSY_EXTENSION_MINUTES')
            .argParser(v => parseInt(v))
            .default(15)
    )
    .addOption(
        new Option('--task-extension-minutes <number>', 'Extension per task progress report (default 15)')
            .env('TASK_EXTENSION_MINUTES')
            .argParser(v => parseInt(v))
            .default(15)
    )
    .addOption(
        new Option('--manual-extension-minutes <number>', 'Extension from the in-app Keep-it-running button (default 60)')
            .env('MANUAL_EXTENSION_MINUTES')
            .argParser(v => parseInt(v))
            .default(60)
    )
    .addOption(
        // Its own key rather than sharing manualExtensionMinutes: delivery latency plus "find a
        // laptop" is itself several minutes, so this one may deserve to be larger still.
        new Option('--email-extension-minutes <number>', 'Extension from the email keep-running link (default 60)')
            .env('EMAIL_EXTENSION_MINUTES')
            .argParser(v => parseInt(v))
            .default(60)
    )
    .addOption(
        // The hard bound on load-only extension, measured from the last human interaction (falling
        // back to activation). An overnight job is covered; a crashed process spinning a core stops
        // buying time twelve hours after the last keystroke.
        new Option('--max-unattended-hours <number>', 'Cap on load-only extension, from the last interaction (default 12)')
            .env('MAX_UNATTENDED_HOURS')
            .argParser(v => parseFloat(v))
            .default(12)
    )
    .addOption(
        new Option('--notification-visible-minutes <number>', 'Unacknowledged notification → email (default 5)')
            .env('NOTIFICATION_VISIBLE_MINUTES')
            .argParser(v => parseInt(v))
            .default(5)
    )
    .addOption(
        new Option('--session-grace-minutes <number>', 'Notification → close (default 60)')
            .env('SESSION_GRACE_MINUTES')
            .argParser(v => parseInt(v))
            .default(60)
    )
    .addOption(
        new Option('--unknown-busy-grace-ticks <number>', 'Consecutive below-coverage sampler ticks treated as busy (default 10)')
            .env('UNKNOWN_BUSY_GRACE_TICKS')
            .argParser(v => parseInt(v))
            .default(10)
    )
    .addOption(
        new Option('--busy-window-minutes <number>', 'Rolling window for the busy verdict (default 10)')
            .env('BUSY_WINDOW_MINUTES')
            .argParser(v => parseInt(v))
            .default(10)
    )
    .addOption(
        // ABSOLUTE cores, not percent of instance. Percent-of-instance fails in both directions at
        // once: enough idle app tabs pin a small instance busy, while a real one-core job on a
        // 64-core instance reads as idle. Three idle apps use ~0.03 cores; one real job uses 1.0.
        new Option('--busy-cpu-cores <number>', 'Cores used at or above which a session counts as busy (default 0.5)')
            .env('BUSY_CPU_CORES')
            .argParser(v => parseFloat(v))
            .default(0.5)
    )
    .addOption(
        new Option('--busy-gpu-threshold-pct <number>', 'Avg GPU utilization at or above which a session counts as busy (default 5)')
            .env('BUSY_GPU_THRESHOLD_PCT')
            .argParser(v => parseFloat(v))
            .default(5)
    )
    .addOption(
        // The measured idle floor is 14.7 KB/s for three open apps and scales ~4.9 KB/s per app,
        // so the old 50 KB/s idle threshold left only a 3.4x margin — ~10 idle tabs would have
        // pinned a session permanently busy. Real transfers run at MB/s.
        new Option('--busy-network-threshold-kbps <number>', 'Avg network rate at or above which a session counts as busy (KB/s, default 500)')
            .env('BUSY_NETWORK_THRESHOLD_KBPS')
            .argParser(v => parseFloat(v))
            .default(500)
    )
    .addOption(
        new Option('--session-expiry-secret <string>', 'HMAC secret for the email action links (random per process if unset)')
            .env('SESSION_EXPIRY_SECRET')
    )
    .addOption(
        new Option('--sepal-endpoint <url>', 'Public SEPAL base URL, for links in outbound email')
            .env('SEPAL_ENDPOINT')
    )

    // ─── Docker ─────────────────────────────────────────────────────────────
    .addOption(
        new Option('--docker-port <number>', 'Docker Engine TCP port on worker instances (default 2375)')
            .env('DOCKER_PORT')
            .argParser(v => parseInt(v))
            .default(DEFAULT_DOCKER_PORT)
    )
    .addOption(
        new Option('--docker-entry-point <string>', 'Docker Engine API version path prefix (e.g. v1.38)')
            .env('DOCKER_ENTRY_POINT')
    )
    .addOption(
        new Option('--docker-registry-host <string>', 'Docker registry hostname for image pulls')
            .env('DOCKER_REGISTRY_HOST')
    )

    // ─── GEE credentials ────────────────────────────────────────────────────
    .addOption(
        new Option('--google-project-id <string>', 'Google Cloud project ID for GEE')
            .env('GOOGLE_PROJECT_ID')
    )
    .addOption(
        new Option('--google-region <string>', 'Google Cloud region (e.g. europe-west1)')
            .env('GOOGLE_REGION')
    )
    .addOption(
        new Option('--google-earth-engine-account <string>', 'GEE service account email')
            .env('GOOGLE_EARTH_ENGINE_ACCOUNT')
    )
    .addOption(
        new Option('--google-earth-engine-private-key <string>', 'GEE service account private key (PEM)')
            .env('GOOGLE_EARTH_ENGINE_PRIVATE_KEY')
    )

    // ─── Deploy environment ─────────────────────────────────────────────────
    .addOption(
        new Option('--deploy-environment <string>', 'Deployment environment name (e.g. DEV | PRODUCTION)')
            .env('DEPLOY_ENVIRONMENT')
    )

    // ─── Google OAuth ───────────────────────────────────────────────────────
    .addOption(
        new Option('--google-oauth-endpoint <url>', 'user-module Google OAuth endpoint base (trailing slash)')
            .env('GOOGLE_OAUTH_ENDPOINT')
            .default('http://user/google/')
    )

    // ─── Budget ─────────────────────────────────────────────────────────────
    .addOption(
        new Option('--budget-url <url>', 'budget-module base URL (live over-budget check on session request)')
            .env('BUDGET_URL')
            .default('http://budget')
    )

    // ─── RabbitMQ ───────────────────────────────────────────────────────────
    .addOption(
        new Option('--rabbitmq-host <string>', 'RabbitMQ hostname')
            .env('RABBITMQ_HOST')
    )
    .addOption(
        new Option('--rabbitmq-port <number>', 'RabbitMQ AMQP port (default 5672)')
            .env('RABBITMQ_PORT')
            .argParser(v => parseInt(v))
            .default(DEFAULT_RABBITMQ_PORT)
    )

    // ─── AWS — only required when HOSTING_SERVICE=aws ────────────────────────
    .addOption(
        new Option('--region <string>', 'AWS region (e.g. eu-central-1) [aws only]')
            .env('AWS_REGION')
    )
    .addOption(
        new Option('--availability-zone <string>', 'AWS availability zone (e.g. eu-central-1a) [aws only]')
            .env('AVAILABILITY_ZONE')
    )
    .addOption(
        new Option('--access-key <string>', 'AWS access key ID [aws only]')
            .env('AWS_ACCESS_KEY_ID')
    )
    .addOption(
        new Option('--secret-key <string>', 'AWS secret access key [aws only]')
            .env('AWS_SECRET_ACCESS_KEY')
    )
    .addOption(
        new Option('--syslog-address <string>', 'Syslog UDP address for Docker log driver (e.g. udp://host:514) [aws only]')
            .env('SYSLOG_ADDRESS')
    )
    .addOption(
        new Option('--environment <string>', 'AWS environment tag value (e.g. production) [aws only]')
            .env('ENVIRONMENT')
    )

    .parse()

const {
    port,
    hostingService,
    sepalVersion,
    sepalUser,
    sepalPassword,
    sepalHost,
    sepalHttpsPort,
    sepalHostDataDir,
    sepalHostProjectDir,
    workerPort,
    usageSamplingIntervalSeconds,
    usageSampleRetentionDays,
    usageHourlyRetentionDays,
    sessionExpiryMode,
    startupLeaseMinutes,
    openExtensionMinutes,
    interactionExtensionMinutes,
    busyExtensionMinutes,
    taskExtensionMinutes,
    manualExtensionMinutes,
    emailExtensionMinutes,
    maxUnattendedHours,
    notificationVisibleMinutes,
    sessionGraceMinutes,
    unknownBusyGraceTicks,
    busyWindowMinutes,
    busyCpuCores,
    busyGpuThresholdPct,
    busyNetworkThresholdKbps,
    sessionExpirySecret,
    sepalEndpoint,
    dockerPort,
    dockerEntryPoint,
    dockerRegistryHost,
    googleProjectId,
    googleRegion,
    googleEarthEngineAccount,
    googleEarthEnginePrivateKey,
    googleOAuthEndpoint,
    budgetUrl,
    deployEnvironment,
    rabbitmqHost,
    rabbitmqPort,
    region,
    availabilityZone,
    accessKey,
    secretKey,
    syslogAddress,
    environment,
} = program.opts()

log.info('Configuration loaded')

export {
    accessKey,
    availabilityZone,
    budgetUrl,
    busyCpuCores,
    busyExtensionMinutes,
    busyGpuThresholdPct,
    busyNetworkThresholdKbps,
    busyWindowMinutes,
    deployEnvironment,
    dockerEntryPoint,
    dockerPort,
    dockerRegistryHost,
    emailExtensionMinutes,
    environment,
    googleEarthEngineAccount,
    googleEarthEnginePrivateKey,
    googleOAuthEndpoint,
    googleProjectId,
    googleRegion,
    hostingService,
    interactionExtensionMinutes,
    manualExtensionMinutes,
    maxUnattendedHours,
    notificationVisibleMinutes,
    openExtensionMinutes,
    port,
    rabbitmqHost,
    rabbitmqPort,
    region,
    secretKey,
    sepalEndpoint,
    sepalHost,
    sepalHostDataDir,
    sepalHostProjectDir,
    sepalHttpsPort,
    sepalPassword,
    sepalUser,
    sepalVersion,
    sessionExpiryMode,
    sessionExpirySecret,
    sessionGraceMinutes,
    startupLeaseMinutes,
    syslogAddress,
    taskExtensionMinutes,
    unknownBusyGraceTicks,
    usageHourlyRetentionDays,
    usageSampleRetentionDays,
    usageSamplingIntervalSeconds,
    workerPort,
}
