const {spawn} = require('child_process')
const Path = require('path')
const log = require('#sepal/log').getLogger('script')

const runScript = (script, args, {showStdOut, showStdErr} = {}) =>
    new Promise((resolve, reject) => {
        log.trace(`Running script ${script} with args:`, args)
        const cmd = spawn(Path.join('./src/script', script), args)

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

module.exports = {runScript}
