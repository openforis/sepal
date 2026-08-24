import _ from 'lodash'

import {delete$, get$, post$} from '~/http-client'

import {getClientId} from './ws'

export default {
    loadAll$: () => get$('/api/apps/list'),

    // The session report is pushed by the worker/session websocket (see ~/widget/sessionMonitor),
    // and runApp$ waits on that.
    // clientId (the gateway-assigned ws client id) is stored by the worker as the app
    // association's owner: its clientDown releases the association, and another client
    // taking the app over closes the tab here.
    // reassert marks the ws-reconnect replay (see ~/app/home/body/apps/appSessionMonitor): the
    // association's owner is refreshed but no deadline moves, because nobody opened anything.
    requestSession$: ({endpoint, appPath, appLabel, sessionId, instanceType, reassert}) =>
        post$('/api/sandbox/start', {
            query: _.omitBy({endpoint: endpoint ? endpoint : 'shiny', appPath, appLabel, sessionId, instanceType, clientId: getClientId(), reassert: reassert ? 'true' : undefined}, _.isUndefined)
        }),

    // Unbind the app from its instance — the instance stays up; the app can then be
    // re-opened on a different instance. Used on tab close AND to dissociate a conflicting
    // app before a confirmed move (takeover); clientId identifies this client as the
    // requester, so only OTHER browsers are told to close their tabs.
    releaseSession$: appPath =>
        delete$('/api/sandbox/start', {
            query: _.omitBy({appPath, clientId: getClientId()}, _.isUndefined)
        }),

    // A real user interaction inside the app's iframe — the signal that extends the session's
    // deadline (docs/session-expiration-model.md §4a). The gateway marks the session and its next
    // heartbeat carries the flag, so this never waits on the worker.
    //
    // observable=false says the opposite: this app navigated genuinely cross-origin and the GUI
    // CANNOT see its input, so the gateway should fall back to counting proxied requests for it.
    // Without such a declaration a session is assumed observable and polling extends nothing.
    reportInteraction$: ({sessionId, observable = true}) =>
        post$('/api/sandbox/interaction', {
            query: _.omitBy({sessionId, observable: observable ? undefined : 'false'}, _.isUndefined)
        })
}
