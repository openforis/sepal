import {get$, post$} from '~/http-client'

import {moduleWebSocket$} from './ws.js'

export default {
    ws: () => moduleWebSocket$('worker/session'),

    usage$: () =>
        get$('/api/sessions/usage'),

    userUsage$: username =>
        get$(`/api/sessions/${username}/usage`),

    // The Extend button on the expiry notification. Answers 409 when no ACTIVE session matched,
    // so the caller can tell "extended" from "there was nothing left to extend".
    extendNow$: sessionId =>
        post$(`/api/sessions/session/${sessionId}/extend-now`),

    // Suppresses the escalation email and nothing else — the session still closes at T+grace.
    dismissExpiry$: sessionId =>
        post$(`/api/sessions/session/${sessionId}/dismiss-expiry`),
}
