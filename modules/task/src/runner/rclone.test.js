import {copyFile, rcloneEnv, spawnRclone} from './rclone.js'

const access = {mode: 'readWrite', rclone: {type: 's3', root: 'bucket/users/alice', options: {provider: 'AWS', access_key_id: 'K', secret_access_key: 'S', session_token: 'T'}}}

describe('rcloneEnv', () => {
    it('defines the Data remote from access, at the user\'s root', () => {
        expect(rcloneEnv(access)).toEqual({
            RCLONE_CONFIG_DATAREMOTE_TYPE: 's3',
            RCLONE_CONFIG_DATAREMOTE_PROVIDER: 'AWS',
            RCLONE_CONFIG_DATAREMOTE_ACCESS_KEY_ID: 'K',
            RCLONE_CONFIG_DATAREMOTE_SECRET_ACCESS_KEY: 'S',
            RCLONE_CONFIG_DATAREMOTE_SESSION_TOKEN: 'T',
            RCLONE_CONFIG_DATA_TYPE: 'alias',
            RCLONE_CONFIG_DATA_REMOTE: 'dataremote:bucket/users/alice'
        })
    })

    it.each([['bad-key', 'v'], ['ok', 'a\nb']])('refuses option %p=%p', (key, value) => {
        expect(() => rcloneEnv({...access, rclone: {...access.rclone, options: {[key]: value}}})).toThrow()
    })
})

describe('copyFile', () => {
    it('copies a file to its path in Data, keeping credentials out of the arguments', async () => {
        const runs = []
        const run = async (args, options) => { runs.push({args, env: options.env}); return {code: 0, stderr: ''} }

        await copyFile({access, localPath: '/stage/a.tif', remotePath: 'exports/x/a.tif', run})

        expect(runs[0].args.slice(0, 3)).toEqual(['copyto', '/stage/a.tif', 'data:exports/x/a.tif'])
        expect(runs[0].args.join(' ')).not.toContain('S')
        expect(runs[0].args).toContain('--s3-no-check-bucket')
        expect(runs[0].env.RCLONE_CONFIG_DATAREMOTE_SECRET_ACCESS_KEY).toBe('S')
    })

    it('leaves out --s3-no-check-bucket when access already sets no_check_bucket', async () => {
        const runs = []
        const run = async args => { runs.push(args); return {code: 0, stderr: ''} }
        const withOption = {...access, rclone: {...access.rclone, options: {...access.rclone.options, no_check_bucket: 'true'}}}

        await copyFile({access: withOption, localPath: '/a', remotePath: 'a', run})

        expect(runs[0]).not.toContain('--s3-no-check-bucket')
    })

    it('fails with rclone\'s last error line', async () => {
        const run = async () => ({code: 1, stderr: 'NOTICE: x\nERROR : a.tif: Failed to copy: AccessDenied\n'})

        await expect(copyFile({access, localPath: '/stage/a.tif', remotePath: 'x/a.tif', run}))
            .rejects.toThrow('AccessDenied')
    })

    it('kills the child and rejects with an AbortError when the signal aborts', async () => {
        const controller = new AbortController()
        let pid
        const run = (_args, options) => spawnRclone(['5'], {...options, command: 'sleep', onSpawn: p => { pid = p }})
        setTimeout(() => controller.abort(), 50)
        const started = Date.now()

        const error = await copyFile({access, localPath: '/a', remotePath: 'a', signal: controller.signal, run}).catch(e => e)

        expect(error.name).toBe('AbortError')
        expect(Date.now() - started).toBeLessThan(1000)
        expect(() => process.kill(pid, 0)).toThrow()
    })
})
