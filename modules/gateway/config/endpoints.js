import {sepalAppsHost} from '../src/config.js'
import modules from './modules.json' with {type: 'json'}

// Each path also matches everything below it, and the first registered match wins.
const endpoints = [
    {
        path: '/api/gee',
        target: `http://${modules.gee}`,
        proxyTimeout: 10 * 60 * 1000,
        timeout: 11 * 60 * 1000,
        authenticate: true
    },
    {
        path: '/api/ceo-gateway',
        target: `http://${modules.ceoGateway}`,
        authenticate: true
    },
    {
        path: '/api/terminal',
        target: `http://${modules.terminal}`,
        ws: true,
        authenticate: true
    },
    {
        path: '/api/user/password/reset-request',
        target: `http://${modules.user}/password/reset-request`,
        authenticate: false
    },
    {
        path: '/api/user/password/reset',
        target: `http://${modules.user}/password/reset`,
        authenticate: false
    },
    {
        path: '/api/user/validate',
        target: `http://${modules.user}/validate`,
        authenticate: false
    },
    {
        path: '/api/user/signup',
        target: `http://${modules.user}/signup`,
        authenticate: false
    },
    {
        path: '/api/user/google/access-request-callback',
        target: `http://${modules.user}/google/access-request-callback`,
        authenticate: false
    },
    {
        path: '/api/user',
        target: `http://${modules.user}`,
        authenticate: true
    },
    {
        path: '/api/processing-recipes',
        target: `http://${modules.recipe}`,
        authenticate: true
    },
    {
        path: '/api/budget',
        target: `http://${modules.budget}/budget`,
        authenticate: true
    },
    {
        path: '/api/message',
        target: `http://${modules.message}`,
        authenticate: true
    },
    {
        path: '/api/user-files',
        target: `http://${modules.userFiles}`,
        ws: true,
        authenticate: true
    },
    {
        path: '/api/storage',
        target: `http://${modules.storage}`,
        ws: false,
        authenticate: true
    },
    {
        path: '/api/tasks',
        target: `http://${modules.taskManager}/tasks`,
        authenticate: true
    },
    {
        // The expiry email's action links (keep running / stop now). Unauthenticated by design:
        // they are clicked from a mail client, typically on a phone with no SEPAL session, and the
        // HMAC token in the path carries its own authority — including WHICH action it authorises.
        // Registered BEFORE /api/sessions so the authenticated catch-all does not swallow it.
        path: '/api/sessions/expiry',
        target: `http://${modules.worker}/sessions/expiry`,
        authenticate: false,
        noCache: true
    },
    {
        path: '/api/sessions',
        target: `http://${modules.worker}/sessions`,
        authenticate: true
    },
    {
        path: '/api/scene-metadata',
        target: `http://${modules.sceneMetadata}`,
        authenticate: true
    },
    {
        path: '/api/apps/list',
        target: `http://${modules.appManager}/list`,
        noCache: true
    },
    {
        path: '/api/apps',
        target: `http://${modules.appManager}`,
        authenticate: true
    },
    {
        path: '/api/app-manager',
        target: `http://${modules.appManager}`,
        authenticate: true
    },
    {
        path: '/api/app-launcher',
        target: `http://${sepalAppsHost || modules.appLauncher}`,
        ws: true,
        authenticate: true
    },
    {
        path: '/api/email',
        target: `http://${modules.email}`,
        authenticate: true
    },
    {
        path: '/api/docker/metrics',
        target: 'http://host.docker.internal:9323/metrics',
        authenticate: true
    },
    {
        path: '/api/worker/metrics',
        target: `http://${modules.worker}/metrics`,
        authenticate: true
    },
    {
        path: '/privacy-policy',
        target: `http://${modules.gui}/resource/privacy-policy.html`,
        authenticate: false,
        noCache: true
    }
]

const webSocketEndpoints = [
    {
        module: 'user-files',
        target: `ws://${modules.userFiles}/ws`
    },
    {
        module: 'user-assets',
        target: `ws://${modules.userAssets}/ws`,
        sendGoogleAccessToken: true
    },
    {
        module: 'user',
        target: `ws://${modules.user}/ws`
    },
    {
        module: 'task-manager/task',
        target: `ws://${modules.taskManager}/ws`
    },
    {
        module: 'worker/session',
        target: `ws://${modules.worker}/session/ws`
    },
    {
        module: 'budget',
        target: `ws://${modules.budget}/ws`
    },
    {
        module: 'message',
        target: `ws://${modules.message}/ws`
    }
]

const webSocketPath = '/api/ws'

// User-module endpoints only the ssh-gateway may call, module-to-module: the /api/user endpoint
// would otherwise forward them to anyone.
export const internalPaths = ['/api/user/auth', '/api/user/nss']

export {endpoints, webSocketEndpoints, webSocketPath}
