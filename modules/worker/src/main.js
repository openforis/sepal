import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'
import {initMessageQueue} from '#sepal/messageQueue'

import * as config from './config.js'
import {getPool, initializeDatabase} from './db.js'
import {createHostingService} from './hostingService/index.js'
import {createBusyRegistry} from './instanceUsage/busyRegistry.js'
import {createDockerInstanceStats} from './instanceUsage/dockerInstanceStats.js'
import {createInstanceUsageComponent} from './instanceUsage/index.js'
import {createTerminalRegistry} from './instanceUsage/terminalRegistry.js'
import {createUsageRepository} from './instanceUsage/usageRepository.js'
import {createLockedUsers} from './lockedUsers.js'
import {createRoutes, createWsRoutes} from './routes.js'
import {withTaskChangedEvents} from './task/events.js'
import {createTaskComponent} from './task/index.js'
import {createTaskManager} from './task/taskManager.js'
import {createTaskRepository} from './task/taskRepository.js'
import {createTasksApi} from './task/tasksApi.js'
import {createWorkerGateway} from './task/workerGateway.js'
import {createDockerSandboxServerControl} from './workerInstance/dockerSandboxServerControl.js'
import {createWorkerInstanceComponent} from './workerInstance/index.js'
import {createInstanceRepository} from './workerInstance/instanceRepository.js'
import {createBudgetClient} from './workerSession/budgetClient.js'
import {closeUserSessions as _closeUserSessions} from './workerSession/command/closeUserSessions.js'
import {email$, sendEmail} from './workerSession/email.js'
import {emitWorkerSessionClosed, workerSessionEvents} from './workerSession/events.js'
import {createExpiryMetrics} from './workerSession/expiryMetrics.js'
import {createExpiryTokens} from './workerSession/expiryToken.js'
import {createGoogleOAuthGateway} from './workerSession/googleOAuthGateway.js'
import {createSessionComponent} from './workerSession/index.js'
import {createSandboxServerManager} from './workerSession/sandboxServerManager.js'
import {createSessionAppRepository} from './workerSession/sessionAppRepository.js'
import {createSessionManager} from './workerSession/sessionManager.js'
import {createSessionsApi} from './workerSession/sessionsApi.js'
import {createWorkerSessionApiKey} from './workerSession/workerSessionApiKey.js'
import {createWorkerSessionRepository} from './workerSession/workerSessionRepository.js'

configureServer(logConfig)

const log = getLogger('main')

const {port, rabbitmqHost, rabbitmqPort} = config

const amqpUri = `amqp://${rabbitmqHost}:${rabbitmqPort}`

let instanceComponent = null
let sessionComponent = null
let taskComponent = null
let usageComponent = null

const main = async () => {
    await initializeDatabase()

    // The session_app repository is shared between the worker_session repository (cascade delete
    // on session close) and the session manager, so both talk to ONE instance.
    const sessionAppRepo = createSessionAppRepository(getPool())

    const sessionRepo = createWorkerSessionRepository(getPool(), undefined, sessionAppRepo)
    const sandboxSessionApiKey = createWorkerSessionApiKey(sessionRepo)

    const usageRepo = createUsageRepository(getPool())

    // Constructing the hosting service NEVER calls live AWS; that only happens on
    // provider.start()/launch.
    const hostingService = createHostingService(config, {sandboxSessionApiKey})
    const {instanceProvider, instanceProvisioner, instanceTypes} = hostingService

    const instanceRepo = createInstanceRepository(getPool())
    instanceComponent = createWorkerInstanceComponent({
        repo: instanceRepo,
        provider: instanceProvider,
        provisioner: instanceProvisioner,
        instanceTypes,
    })

    // The locked-users set starts EMPTY on every worker restart and only catches up on the budget
    // module's hourly cycle, so it is the FALLBACK gate, not the authoritative one: requestSession
    // asks budgetClient for a live verdict and only falls back to this set when budget is
    // unreachable. The set is still what closes an over-budget user's running sessions, driven by
    // the budget.UserBudgetExceeded subscriber below.
    // closeUserSessions is bound to the raw command here rather than to sessionManager, which would
    // be a construction cycle (sessionManager depends on lockedUsers).
    const lockedUsers = createLockedUsers({
        closeUserSessions: username => _closeUserSessions(username, {
            repo: sessionRepo,
            instanceManager: instanceComponent.instanceManager,
            emitWorkerSessionClosed,
        }),
    })

    // Constructing the budget client NEVER calls budget; that only happens on check().
    const budgetClient = createBudgetClient(config)

    // The session-expiration policy: the mode plus every magnitude by which an event may move a
    // deadline. ONE object, shared by the session manager (which applies the ratchets), the
    // sampler (busy verdicts and pty interaction) and the REST serialisation — there is no second
    // place where a duration is decided.
    const instanceTypeById = Object.fromEntries(instanceTypes.map(t => [t.id, t]))
    const expiryPolicy = {
        mode: config.sessionExpiryMode,
        startupLeaseMinutes: config.startupLeaseMinutes,
        openExtensionMinutes: config.openExtensionMinutes,
        interactionExtensionMinutes: config.interactionExtensionMinutes,
        busyExtensionMinutes: config.busyExtensionMinutes,
        taskExtensionMinutes: config.taskExtensionMinutes,
        manualExtensionMinutes: config.manualExtensionMinutes,
        emailExtensionMinutes: config.emailExtensionMinutes,
        maxUnattendedHours: config.maxUnattendedHours,
        notificationVisibleMinutes: config.notificationVisibleMinutes,
        graceMinutes: config.sessionGraceMinutes,
        unknownBusyGraceTicks: config.unknownBusyGraceTicks,
        busyWindowMinutes: config.busyWindowMinutes,
        busyCpuCores: config.busyCpuCores,
        busyGpuThresholdPct: config.busyGpuThresholdPct,
        busyNetworkThresholdKBps: config.busyNetworkThresholdKbps,
        samplingIntervalSeconds: config.usageSamplingIntervalSeconds,
    }
    const expiryTokens = createExpiryTokens({
        secret: config.sessionExpirySecret,
        graceMinutes: expiryPolicy.graceMinutes,
    })
    const expiryMetrics = createExpiryMetrics()
    // Written by the sampler each tick, read by the expiry sweep and the session report — one
    // process, two maps, no schema.
    const terminals = createTerminalRegistry()
    const verdicts = createBusyRegistry()
    // The email's link has to be clickable from a phone with no SEPAL session, so it is absolute
    // and public. Without SEPAL_ENDPOINT there is no URL worth putting in an email; the mail still
    // goes out, and using the instance rescues it just as well as the link would have.
    const manageUrl = session => {
        const token = expiryTokens.create({
            sessionId: session.id, notifiedTime: session.notifiedTime,
        })
        return config.sepalEndpoint && token
            ? `${config.sepalEndpoint.replace(/\/+$/, '')}/api/sessions/expiry/${token}`
            : null
    }

    const sessionManager = createSessionManager({
        repo: sessionRepo,
        appRepo: sessionAppRepo,
        instanceManager: instanceComponent.instanceManager,
        budgetClient,
        lockedUsers,
        usageRepo,
        expiryPolicy,
        instanceTypeById,
        sendEmail,
        manageUrl,
        expiryMetrics,
        terminals,
        verdicts,
    })

    log.info(`Session expiration mode: ${expiryPolicy.mode}`)
    if (expiryPolicy.mode !== 'off' && !config.sepalEndpoint) {
        log.warn('SEPAL_ENDPOINT is unset - expiry emails will go out without a working management link')
    }
    const googleOAuthGateway = createGoogleOAuthGateway(config)
    sessionComponent = createSessionComponent({
        sessionManager,
        repo: sessionRepo,
        googleOAuthGateway,
        instanceManager: instanceComponent.instanceManager,
    })

    // workerGateway is the outbound HTTP client to the sandbox task-executor. Constructing it never
    // calls the executor; that only happens on execute/cancel.
    const taskRepo = withTaskChangedEvents(createTaskRepository(getPool()))
    const workerGateway = createWorkerGateway({
        sepalUsername: config.sepalUser || 'sepalAdmin',
        sepalPassword: config.sepalPassword,
        workerPort: config.workerPort,
    })
    const taskManager = createTaskManager({
        repo: taskRepo,
        sessionManager,
        workerGateway,
    })
    taskComponent = createTaskComponent({taskManager})

    usageComponent = createInstanceUsageComponent({
        sessionRepo,
        usageRepo,
        stats: createDockerInstanceStats({config, defaultDaemonHost: hostingService.defaultDaemonHost}),
        instanceTypes,
        samplingIntervalSeconds: config.usageSamplingIntervalSeconds,
        sampleRetentionDays: config.usageSampleRetentionDays,
        hourlyRetentionDays: config.usageHourlyRetentionDays,
        expiryPolicy,
        terminals,
        verdicts,
    })

    const sandboxServers = createSandboxServerManager({
        repo: sessionRepo,
        control: createDockerSandboxServerControl({
            config, defaultDaemonHost: hostingService.defaultDaemonHost}),
    })
    workerSessionEvents.on('WorkerSessionClosed', ({sessionId}) => sandboxServers.forget(sessionId))

    const sessionsApi = createSessionsApi({sessionManager, sandboxServers, expiryPolicy, expiryTokens})
    const tasksApi = createTasksApi({taskManager})

    await initMessageQueue(amqpUri, {
        publishers: [
            ...instanceComponent.WORKER_INSTANCE_PUBLISHERS,
            ...sessionComponent.WORKER_SESSION_PUBLISHERS,
            {key: 'email.sendToUser', publish$: email$},
        ],
        subscribers: [
            sessionComponent.userSubscriber,
            {
                queue: 'worker.budgetExceeded',
                topic: 'budget.UserBudgetExceeded',
                handler: (key, message) => lockedUsers.onExceeded(message),
            },
            {
                queue: 'worker.budgetCleared',
                topic: 'budget.UserBudgetCleared',
                handler: (key, message) => lockedUsers.onCleared(message),
            },
        ],
    })

    // Task component last: its session-event consumers must register against an already-live
    // session component.
    await instanceComponent.start()
    sessionComponent.start()
    taskComponent.start()
    usageComponent.start()

    await server.start({
        port,
        routes: createRoutes({sessionsApi, tasksApi}),
        wsRoutes: createWsRoutes({taskManager, sessionsApi, sessionManager}),
    })

    log.info('Initialized')
}

const stop = async () => {
    if (usageComponent) {
        try {
            usageComponent.stop()
        } catch (error) {
            log.error('Error stopping instanceUsage component', error)
        }
    }
    if (taskComponent) {
        try {
            taskComponent.stop()
        } catch (error) {
            log.error('Error stopping task component', error)
        }
    }
    if (sessionComponent) {
        try {
            sessionComponent.stop()
        } catch (error) {
            log.error('Error stopping workerSession component', error)
        }
    }
    if (instanceComponent) {
        try {
            await instanceComponent.stop()
        } catch (error) {
            log.error('Error stopping workerInstance component', error)
        }
    }
    process.exit(0)
}

process.once('SIGTERM', stop)
process.once('SIGINT', stop)

main().catch(log.fatal)
