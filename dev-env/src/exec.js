import {spawn} from 'child_process'
import {log} from './log.js'

export const exec = ({command, args, cwd, env, detached, enableStdIn, showStdOut, showStdErr}) =>
    new Promise((resolve, reject) => {
        if (args) {
            log.trace(`Running command ${command} with args:`, args)
        } else {
            log.trace(`Running command ${command} with no args:`)
        }

        const cmd = spawn(command, args, {
            cwd,
            env,
            detached,
            stdio: detached
                ? 'ignore'
                : enableStdIn
                    ? 'inherit'
                    : 'pipe',

        })

        if (detached) {
            cmd.unref()
            resolve({pid: cmd.pid})
        } else {
            let stdout = ''
            let stderr = ''

            cmd.stdout?.on('data', data => {
                const out = data.toString('utf8')
                if (showStdOut) {
                    process.stdout.write(out)
                }
                stdout += out
            })
    
            cmd.stderr?.on('data', data => {
                const err = data.toString('utf8')
                if (showStdErr) {
                    process.stderr.write(err)
                }
                stderr += err
            })
    
            cmd.on('close', code =>
                code
                    ? reject({code, stderr, stdout})
                    : resolve(stdout)
            )
        }
    })
