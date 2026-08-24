import {delete$, post$} from '~/http-client'

import {moduleWebSocket$} from './ws.js'

export default {
    ws: () => moduleWebSocket$('message'),

    update$: message =>
        post$(`/api/message/messages/${message.id}`, {
            body: message
        }),

    remove$: message =>
        delete$(`/api/message/messages/${message.id}`),

    updateState$: message =>
        post$(`/api/message/notifications/${message.message.id}`, {
            body: {
                state: message.state
            }
        }),
}
