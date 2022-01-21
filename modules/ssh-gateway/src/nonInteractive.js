const {first, of, switchMap} = require('rxjs')
const {sandboxInfo$, createSession$, joinSession$} = require('./endpoint')

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

module.exports = {nonInteractive$}
