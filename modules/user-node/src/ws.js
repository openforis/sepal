import {takeUntil} from 'rxjs'

import {getLogger} from '#sepal/log'
import {moduleWs$} from '#sepal/ws/module'

import {userUpdated$} from './events.js'

const log = getLogger('ws')

// The gateway opens one connection to /ws. For its lifetime, relay every UserUpdated as
// {event:'userUpdated', user}; the gateway broadcasts it to modules and nudges the user's browser
// clients to refresh. No inbound messages are handled (user-node only pushes).
const protocol = ({send, stop$}) => {
    userUpdated$.pipe(takeUntil(stop$)).subscribe({
        next: user => send({event: 'userUpdated', user}),
        error: error => log.warn('userUpdated stream error', error)
    })
    return () => {}
}

const ws$ = moduleWs$(protocol)

export default ctx => ws$(ctx.arg$)
