import {spawn} from 'node:child_process'
import {tmpdir} from 'node:os'
import Path from 'node:path'

import {getLogger} from '#sepal/log'

const log = getLogger('script')

const SCRIPT_DIR = Path.join(import.meta.dirname, 'script')

const runScript = (script, args, {showStdOut, showStdErr} = {}) =>
    new Promise((resolve, reject) => {
        log.trace(`Running script ${script} with args:`, args)
        // R saves its workspace to .RData in the working directory on SIGUSR1/SIGUSR2, which nodemon sends
        // to the process tree on restart. In dev, the module directory is bind-mounted from the host.
        const cmd = spawn(Path.join(SCRIPT_DIR, script), args, {cwd: tmpdir()})

        let stdout = ''
        let stderr = ''
    
        cmd.stdout.on('data', data => {
            const out = data.toString('utf8')
            if (showStdOut) {
                process.stdout.write(out)
            } else {
                stdout += out
            }
        })
    
        cmd.stderr.on('data', data => {
            const err = data.toString('utf8')
            if (showStdErr) {
                process.stdout.write(err)
            } else {
                stderr += err
            }
        })
    
        cmd.on('close', code =>
            code
                ? reject({code, stdout, stderr})
                : resolve(stdout)
        )
    })

export {runScript}
