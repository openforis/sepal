import {sepalAppsHost} from '../src/config.js'
import modules from './modules.json' with {type: 'json'}

const endpoints = [
    {
        prefix: true,
        path: '/api/gee',
        target: `http://${modules.gee}`,
        proxyTimeout: 10 * 60 * 1000,
        timeout: 11 * 60 * 1000,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/ceo-gateway',
        target: `http://${modules.ceoGateway}`,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/terminal',
        target: `http://${modules.terminal}`,
        ws: true,
        authenticate: true
    },
    {
        prefix: false,
        path: '/api/user/password/reset-request',
        target: `http://${modules.user}/password/reset-request`,
        authenticate: false
    },
    {
        prefix: false,
        path: '/api/user/password/reset',
        target: `http://${modules.user}/password/reset`,
        authenticate: false
    },
    {
        prefix: false,
        path: '/api/user/activate',
        target: `http://${modules.user}/activate`,
        authenticate: false
    },
    {
        prefix: false,
        path: '/api/user/validate',
        target: `http://${modules.user}/validate`,
        authenticate: false
    },
    {
        prefix: false,
        path: '/api/user/signup',
        target: `http://${modules.user}/signup`,
        authenticate: false
    },
    {
        prefix: false,
        path: '/api/user/google/access-request-callback',
        target: `http://${modules.user}/google/access-request-callback`,
        authenticate: false
    },
    {
        prefix: true,
        path: '/api/user',
        target: `http://${modules.user}`,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/processing-recipes',
        target: `http://${modules.recipe}`,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/budget',
        target: `http://${modules.budget}/budget`,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/message',
        target: `http://${modules.message}`,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/user-files',
        target: `http://${modules.userFiles}`,
        ws: true,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/user-storage',
        target: `http://${modules.userStorage}`,
        ws: false,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/tasks',
        target: `http://${modules.worker}/tasks`,
        authenticate: true
    },
    {
        // The expiry email's action links (keep running / stop now). Unauthenticated by design:
        // they are clicked from a mail client, typically on a phone with no SEPAL session, and the
        // HMAC token in the path carries its own authority — including WHICH action it authorises.
        // Registered BEFORE /api/sessions so the authenticated catch-all does not swallow it.
        prefix: true,
        path: '/api/sessions/expiry',
        target: `http://${modules.worker}/sessions/expiry`,
        authenticate: false,
        noCache: true
    },
    {
        prefix: true,
        path: '/api/sessions',
        target: `http://${modules.worker}/sessions`,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/scene-metadata',
        target: `http://${modules.sceneMetadata}`,
        authenticate: true
    },
    {
        prefix: false,
        path: '/api/apps/list',
        target: `http://${modules.appManager}/list`,
        noCache: true
    },
    {
        prefix: true,
        path: '/api/apps',
        target: `http://${modules.appManager}`,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/app-manager',
        target: `http://${modules.appManager}`,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/app-launcher',
        target: `http://${sepalAppsHost || modules.appLauncher}`,
        authenticate: true,
        rewrite: false
    },
    {
        prefix: true,
        path: '/api/email',
        target: `http://${modules.email}`,
        authenticate: true
    },
    {
        prefix: false,
        path: '/api/docker/metrics',
        target: 'http://host.docker.internal:9323/metrics',
        authenticate: true
    },
    {
        prefix: false,
        path: '/api/worker/metrics',
        target: `http://${modules.worker}/metrics`,
        authenticate: true
    },
    {
        prefix: false,
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
        module: 'worker/task',
        target: `ws://${modules.worker}/task/ws`
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

export {endpoints, webSocketEndpoints, webSocketPath}
