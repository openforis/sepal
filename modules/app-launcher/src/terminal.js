const {spawn} = require('child_process')
const log = require('#sepal/log').getLogger('terminal')
const {ClientException} = require('#sepal/exception')

// taken from dev-env/src/terminal.js
const exec = ({command, args, cwd, env, detached, enableStdIn, showStdOut, showStdErr}) =>
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
                    : resolve({stdout, stderr})
            )
        }
    })

const executeCommand = async (command, options = {}) => {
    try {
        log.debug(() => `Executing command: ${command}`)
        if (options.cwd) {
            log.debug(() => `Working directory: ${options.cwd}`)
        }
        
        const {stdout, stderr} = await exec({
            command: '/bin/sh',
            args: ['-c', command],
            cwd: options.cwd,
            env: options.env,
            showStdOut: options.showStdOut !== false,
            showStdErr: options.showStdErr !== false
        })
        
        return {stdout, stderr}
    } catch (error) {
        log.error(`Command execution failed: ${error.message || error.stderr || 'Unknown error'}`)
        if (error.stderr) log.error(`Command stderr: ${error.stderr}`)
        if (error.stdout) log.error(`Command stdout: ${error.stdout}`)
        throw new ClientException(`Command execution failed: ${error.stderr || error.message || 'Unknown error'}`)
    }
}

module.exports = executeCommand
