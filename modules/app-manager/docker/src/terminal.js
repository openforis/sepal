const {Subject} = require('rxjs')
const log = require('sepal/log').getLogger('terminal')
const {execFile} = require('child_process')

const exec$ = (workingDir, command, args) => {
    const result$ = new Subject()
    execFile(command, args, {cwd: workingDir}, (error, stdOut, stdErr) => {
        if (error) {
            log.warn(`Failed to execute command: ${command}:`, {error, stdErr, stdOut})
            result$.error(error)
        } else {
            log.debug(`${workingDir}$ ${command} ${args.join(' ')}`)
            log.debug(stdErr ? `${stdErr.trim()}\n${stdOut.trim()}` : stdOut.trim())
            result$.next(stdOut)
            result$.complete()
        }
    })
    return result$
}

module.exports = {exec$}
