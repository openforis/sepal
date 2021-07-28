const {readdir, realpath, watch} = require('fs/promises')
const log = require('sepal/log').getLogger('filesystem')

const createWatcher = async ({out$, stop$, baseDir}) => {
    const abortControllers = {}
    const realBaseDir = await realpath(baseDir)

    const send = data => {
        out$.next(
            JSON.stringify(data)
        )
    }

    const addPath = async path => {
        if (!abortControllers[path]) {
            const abortController = new AbortController()
            abortControllers[path] = abortController
            try {
                log.trace(`Adding watched path: ${path}`)
                stop$.subscribe(
                    () => removePath(path, {ignoreMissing: true})
                )
                const files = await readdir(path)
                send({path, files})
                const watcher = watch(path, {
                    signal: abortController.signal
                })
                for await (const event of watcher) {
                    log.debug(event)
                    send({path, filename: event.filename})
                }
                log.debug(`Added watched path: ${path}`)
            } catch (error) {
                if (error.code === 'ENOENT') {
                    log.warn(`Cannot add non-existing path: ${path}`)
                    return
                }
                if (error.name !== 'AbortError') {
                    return
                }
                throw error
            }
        } else {
            log.warn(`Cannot add already-watched path: ${path}`)
        }
    }

    const removePath = (path, {ignoreMissing = false} = {}) => {
        const abortController = abortControllers[path]
        if (abortController) {
            log.debug(`Removing watched path: ${path}`)
            abortController.abort()
            delete abortControllers[path]
        } else {
            ignoreMissing || log.warn(`Cannot remove non-watched path: ${path}`)
        }
    }
    
    return {addPath, removePath}
}

module.exports = {
    createWatcher
}
