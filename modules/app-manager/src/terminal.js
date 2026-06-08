import {spawn} from 'child_process'
import {Subject} from 'rxjs'

import {getLogger} from '#sepal/log'
const log = getLogger('terminal')

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
    } catch (error) {
        result$.error(error)
    }
    return result$
}

export {exec$}
