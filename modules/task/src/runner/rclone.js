import {spawn} from 'node:child_process'

const OPTION_KEY = /^[a-z0-9_]+$/

// Credentials travel in the environment, never in argv. Mirrors modules/sandbox/bin/sepal-data.
export function rcloneEnv(access) {
    const {type, root, options} = access.rclone
    const env = {RCLONE_CONFIG_DATAREMOTE_TYPE: type}
    Object.entries(options).forEach(([key, value]) => {
        if (!OPTION_KEY.test(key)) {
            throw new Error(`Unsafe Data option name: ${key}`)
        }
        if (/[\r\n]/.test(String(value))) {
            throw new Error(`Unsafe Data option value for ${key}`)
        }
        env[`RCLONE_CONFIG_DATAREMOTE_${key.toUpperCase()}`] = String(value)
    })
    env.RCLONE_CONFIG_DATA_TYPE = 'alias'
    env.RCLONE_CONFIG_DATA_REMOTE = `dataremote:${root}`
    return env
}

export async function copyFile({access, localPath, remotePath, signal, run = spawnRclone}) {
    const args = [
        'copyto', localPath, `data:${remotePath}`,
        '--config', '/dev/null',
        ...(access.rclone.options?.no_check_bucket === undefined ? ['--s3-no-check-bucket'] : []),
        '--retries', '3', '--low-level-retries', '10'
    ]
    const {code, stderr} = await run(args, {env: {...process.env, ...rcloneEnv(access)}, signal})
    if (code !== 0) {
        const lastLine = stderr.split('\n').map(line => line.trim()).filter(Boolean).pop()
        throw new Error(lastLine ?? `rclone exited with code ${code}`)
    }
}

export function spawnRclone(args, {env, signal, command = 'rclone', onSpawn}) {
    return new Promise((resolve, reject) => {
        const abortError = () => Object.assign(new Error('Aborted'), {name: 'AbortError'})
        if (signal?.aborted) {
            return reject(abortError())
        }
        const child = spawn(command, args, {env, stdio: ['ignore', 'ignore', 'pipe']})
        onSpawn?.(child.pid)
        let stderr = ''
        let aborted = false
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4096) })
        const onAbort = () => {
            aborted = true
            child.kill('SIGTERM')
        }
        signal?.addEventListener('abort', onAbort, {once: true})
        child.on('error', error => {
            signal?.removeEventListener('abort', onAbort)
            reject(error)
        })
        child.on('close', code => {
            signal?.removeEventListener('abort', onAbort)
            aborted ? reject(abortError()) : resolve({code: code ?? 1, stderr})
        })
    })
}
