import {of, switchMap} from 'rxjs'

import {println} from './console.js'
import {createSession$, joinSession$, sandboxInfo$} from './endpoint.js'
import {failureMessage} from './interactive.js'

const getSession$ = ({sessions, instanceTypes}) => {
    const findSession = (sessions, expectedStatus) =>
        sessions.find(({status}) => status === expectedStatus)

    const activeSession = findSession(sessions, 'ACTIVE')
    const startingSession = findSession(sessions, 'STARTING')
    const firstTaggedInstanceType = instanceTypes.find(type => type.tag)

    return activeSession
        ? of(activeSession)
        : startingSession
            ? joinSession$(startingSession)
            : createSession$(firstTaggedInstanceType)
}

const nonInteractive$ = () => {
    return sandboxInfo$().pipe(
        switchMap(info => info.exceededBudget ? of() : getSession$(info)),
        switchMap(session => {
            if (session?.unavailable) {
                // No menu to fall back to here (scp/one-off command) — report and end the
                // connection without writing a session script.
                println(failureMessage(session.reason))
                return of()
            }
            return of(session)
        })
    )
}

export {nonInteractive$}
