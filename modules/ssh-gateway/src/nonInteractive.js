import {of, switchMap} from 'rxjs'
import {sandboxInfo$, createSession$, joinSession$} from './endpoint.js'

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
        switchMap(info => info.exceededBudget ? of() : getSession$(info))
    )
}

export {nonInteractive$}
