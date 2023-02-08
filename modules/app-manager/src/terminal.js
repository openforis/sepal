const {Subject} = require('rxjs')
const log = require('#sepal/log').getLogger('terminal')
const {spawn} = require('child_process')

const exec$ = (workingDir, command, args) => {
    const result$ = new Subject()
    try {
        let lastLine
        log.debug(() => `${workingDir}$ ${command} ${args.join(' ')}`)
        const process = spawn(command, args, {cwd: workingDir})
        process.stdout.on('data', data => {
            const s = data.toString().trim()
            lastLine = s
            log.debug(s)
        })
        process.stderr.on('data', data => log.warn(data.toString().trim()))
        process.on('close', () => {
            result$.next(lastLine)
            result$.complete()
        })
        process.on('error', error => {
            result$.error(error)
        })
        process.on('uncaughtException', error => {
            result$.error(error)
        })
    } catch (error) {
        result$.error(error)
    }
    return result$
}

module.exports = {exec$}
