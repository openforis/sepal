const Job = require('sepal/worker/job')
const logConfig = require('./log.json')

const worker$ = (username, {args$, initArgs: {homeDir}}) => {
    const log = require('sepal/log').getLogger('files')
    const {Subject, finalize} = require('rxjs')
    const Path = require('path')
    const {createWatcher} = require('./watcher')

    const userHomeDir = Path.join(homeDir, username)
    const out$ = new Subject()
    const stop$ = new Subject()

    const watcher = createWatcher({out$, stop$, baseDir: userHomeDir})

    const parseMessage = msg => {
        try {
            const {command, path} = JSON.parse(msg)
            switch (command) {
            case 'open':
                watcher.addPath(path)
                break
            case 'close':
                watcher.removePath(path)
                break
                // case 'delete':
                //     break
            default:
                throw new Error(`Unsupported command: ${command}`)
            }
        } catch (error) {
            log.warn('Ignoring malformed message', msg)
        }
    }

    args$.subscribe({
        next: command => parseMessage(command),
    })

    // watcher.addPath(userHomeDir)

    return out$.pipe(
        finalize(
            () => stop$.next()
        )
    )
}

module.exports = Job(logConfig)({
    jobName: 'Files',
    jobPath: __filename,
    before: [],
    initArgs: () => ({homeDir: require('./config').homeDir}),
    args: ({params: {username}}) => [username],
    worker$
})
