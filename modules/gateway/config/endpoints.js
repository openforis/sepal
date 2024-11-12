const modules = require('./modules')

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
        target: `http://${modules.sepal}/api/processing-recipes`,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/budget',
        target: `http://${modules.sepal}/api/budget`,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/notification',
        target: `http://${modules.sepal}/api/notification`,
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
        path: '/api/tasks',
        target: `http://${modules.sepal}/api/tasks`,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/sessions',
        target: `http://${modules.sepal}/api/sessions`,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/data',
        target: `http://${modules.sepal}/api/data`,
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
        path: '/api/sandbox/jupyter',
        target: `http://${modules.sandbox}/jupyter/api/sandbox/jupyter/`,
        authenticate: true,
        rewrite: false
    },
    {
        prefix: true,
        path: '/api/sandbox',
        target: `http://${modules.sandbox}`,
        authenticate: true,
        rewrite: true
    },
    {
        prefix: true,
        path: '/api/app-manager',
        target: `http://${modules.appManager}`,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/email',
        target: `http://${modules.email}`,
        authenticate: true
    },
    {
        prefix: true,
        path: '/api/sys-monitor',
        target: `http://${modules.sysMonitor}`,
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
        path: '/privacy-policy',
        target: `http://${modules.gui}/resource/privacy-policy.html`,
        authenticate: false,
        noCache: true
    },
    {
        prefix: true,
        path: '/api/app-launcher',
        target: `http://${modules.appLauncher}`,
        authenticate: true,
        rewrite: false
    },

]

const webSocketEndpoints = [
    {
        module: 'user-files',
        target: `ws://${modules.userFiles}/ws`
    }
]

const webSocketPath = '/api/ws'

module.exports = {endpoints, webSocketEndpoints, webSocketPath}
