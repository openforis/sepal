const {get$, post$} = require('sepal/httpClient')
const {filter, first, from, interval, map, of, switchMap, tap} = require('rxjs')
const fs = require('fs').promises
const {
    interactive,
    username,
    userKeyFile,
    endpoint,
    endpointPassword,
    sshCommandPath
} = require('./config')

const WAIT_TIME = 5 * 1000

const endpointConfig = {
    username: 'sepalAdmin',
    password: endpointPassword,
    headers: {'sepal-user': JSON.stringify({username, roles: ['application_admin']})}
}

const sandboxInfo$ = () => {
    return get$(`${endpoint}sessions/${username}/report`, endpointConfig).pipe(
        map(response => JSON.parse(response.body))
    )
}

const joinSession$ = session => {
    console.log('Joining', session)
    const loadSession$ = () =>
        post$(`${endpoint}${session.path}`, endpointConfig).pipe(
            map(response => {
                const loadedSession = JSON.parse(response.body)
                console.log('Loaded', loadedSession)
                return loadedSession
            })
        )
    return interval(WAIT_TIME).pipe( // Retry until session is not starting
        switchMap(() => loadSession$()),
        filter(session => session.status !== 'STARTING'),
        first()
    )
}

const createSession$ = instanceType => {
    console.log('Creating', instanceType)
    // TODO: Check budget
    return post$(`${endpoint}${instanceType.path}`, endpointConfig).pipe(
        switchMap(response => {
            const createdSession = JSON.parse(response.body)
            return joinSession$(createdSession)
        })
    )
}

const getSession$ = ({sessions, instanceTypes}) => {
    const findSession = (sessions, expectedStatus) =>
        sessions.find(({status}) => status === expectedStatus)

    const activeSession = findSession(sessions, 'ACTIVE')
    const startingSession = findSession(sessions, 'STARTING')
    const firstTaggedInstanceType = instanceTypes.find(type => type.tag)

    return activeSession
        ? of(activeSession)
        : startingSession
            ? jointSession$(startingSerssion)
            : createSession$(firstTaggedInstanceType)
}

const writeSession$ = session => {
    const contents = `#!/usr/bin/env bash
        \$(alive.sh ${session.id} > ~/alive.log 2>&1 &) && ssh \
        -i "${userKeyFile}" \
        -l "${session.username}" \
        -q \
        -oStrictHostKeyChecking=no \
        -oUserKnownHostsFile=/dev/null \
        -oBatchMode=yes \
        -p 222 \
        ${session.host} \$1`
    return from(fs.writeFile(sshCommandPath, contents))
}

const interactive$ = () => {
    // TODO: Implement...
    return null
}

const nonInteractive$ = () => {
    return sandboxInfo$().pipe(
        switchMap(getSession$),
        first(),
        tap(writeSession$)
    )
}

(interactive
    ? interactive$()
    : nonInteractive$()
).subscribe({error: error => { throw new Error(error) }})

process.on('uncaughtException', error => {
    console.error('Something went wrong, please try again', error)
    process.exit(1)
})
