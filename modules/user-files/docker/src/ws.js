const Job = require('sepal/worker/job')
const logConfig = require('./log.json')

const getSepalUser = request => {
    const sepalUser = request.headers['sepal-user']
    return sepalUser
        ? JSON.parse(sepalUser)
        : {}
}

const getInitArgs = () => {
    const {homeDir, pollIntervalMilliseconds} = require('./config')
    return {homeDir, pollIntervalMilliseconds}
}

const worker$ = (username, {args$, initArgs: {homeDir, pollIntervalMilliseconds}}) => {
    const {realpath} = require('fs/promises')
    const log = require('sepal/log').getLogger('files')
    const {Subject, finalize, from} = require('rxjs')
    const {switchMap} = require('rxjs/operators')
    const Path = require('path')
    const {createWatcher} = require('./filesystem')
    const _ = require('lodash')

    const userHomeDir = Path.join(homeDir, username)
    const out$ = new Subject()
    const stop$ = new Subject()

    const init = async () => {
        const baseDir = await realpath(userHomeDir)
        const watcher = await createWatcher({out$, stop$, baseDir, pollIntervalMilliseconds})

        watcher.monitor('/')

        const parseJSON = json => {
            try {
                return JSON.parse(json)
            } catch (error) {
                log.warn('Malformed JSON message:', json)
            }
        }
    
        const processMessage = json => {
            const msg = parseJSON(json)
            if (msg) {
                if (!_.isNil(msg.monitor)) {
                    watcher.monitor(msg.monitor)
                } else if (!_.isNil(msg.unmonitor)) {
                    watcher.unmonitor(msg.unmonitor)
                } else if (!_.isNil(msg.remove)) {
                    watcher.remove(msg.remove)
                } else if (!_.isNil(msg.enabled)) {
                    watcher.enabled(msg.enabled)
                } else {
                    log.warn('Unsupported message:', msg)
                }
            }
        }
    
        args$.subscribe(
            msg => processMessage(msg)
        )
    }

    return from(init()).pipe(
        switchMap(() => out$.pipe(
            finalize(
                () => stop$.next()
            )
        ))
    )
}

module.exports = Job(logConfig)({
    jobName: 'Files',
    jobPath: __filename,
    before: [],
    initArgs: () => getInitArgs(),
    args: request => [getSepalUser(request).username],
    worker$
})
