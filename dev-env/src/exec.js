import {spawn} from 'child_process'
import {log} from './log.js'

export const exec = ({command, args, showStdOut, showStdErr}) =>
    new Promise((resolve, reject) => {
        if (args) {
            log.trace(`Running command ${command} with args:`, args)
        } else {
            log.trace(`Running command ${command} with no args:`)
        }
        const cmd = spawn(command, args)

        let stdout = ''
        let stderr = ''

        cmd.stdout.on('data', data => {
            const out = data.toString('utf8')
            showStdOut && process.stdout.write(out)
            stdout += out
        })

        cmd.stderr.on('data', data => {
            const err = data.toString('utf8')
            showStdErr && process.stderr.write(err)
            stderr += err
        })

        cmd.on('close', code =>
            code
                ? reject({code, stderr})
                : resolve(stdout)
        )
    })
