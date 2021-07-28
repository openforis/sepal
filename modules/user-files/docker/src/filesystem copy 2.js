const {watch} = require('fs/promises')
const log = require('sepal/log').getLogger('filesystem')

const createWatcher = ({path, out$, stop$}) => {
    const ac = new AbortController()
    const {signal} = ac
    const watchers = {}
    
    const start = async () => {
        log.info(`Starting watcher for path: ${path}`)
        try {
            const watcher = watch(path, {
                signal
            })
            stop$.subscribe(
                () => stop()
            )
            for await (const event of watcher) {
                log.debug(event)
                out$.next({path, filename: event.filename})
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                throw err
            }
        }
    }

    const stop = () => {
        log.info(`Stopping watcher for path: ${path}`)
        ac.abort()
    }

    const add = path => {
        if (!watchers[path]) {
            watchers[path] = createWatcher({path, out$, stop$})
        } else {
            log.warn(`Cannot add already existing watcher for path: ${path}`)
        }
    }
    
    const remove = path => {
        const watcher = watchers[path]
        if (watcher) {
            watcher.stop()
        } else {
            log.warn(`Cannot remove non-existing watcher for path: ${path}`)
        }
    }
    
    return {start, stop, add, remove}
}

module.exports = {
    createWatcher
}
