import {execFile} from 'child_process'
import {dirname} from 'path'
import {fileURLToPath} from 'url'
import {promisify} from 'util'

// Compose hands an unset ${VAR} to the container as an empty string.
describe('config', () => {
    test('uses the default for an option whose variable is empty', async () => {
        const config = await loadConfig({SEPAL_HTTPS_PORT: ''})

        expect(config.sepalHttpsPort).toBe(443)
    })

    test('leaves an option without a default unset when its variable is empty', async () => {
        const config = await loadConfig({SESSION_EXPIRY_SECRET: ''})

        expect(config).not.toHaveProperty('sessionExpirySecret')
    })

    test('parses a variable that has a value', async () => {
        const config = await loadConfig({SEPAL_HTTPS_PORT: '8443', SESSION_EXPIRY_SECRET: 'secret'})

        expect(config).toMatchObject({sepalHttpsPort: 8443, sessionExpirySecret: 'secret'})
    })
})

const MODULE_DIR = dirname(dirname(fileURLToPath(import.meta.url)))

// The configuration is parsed from the environment when config.js is first imported.
const loadConfig = async env => {
    const script = 'const config = await import("./src/config.js"); console.log(JSON.stringify({...config}))'
    const {stdout} = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', script], {
        cwd: MODULE_DIR,
        env: {PATH: process.env.PATH, ...env}
    })
    return JSON.parse(stdout.trim().split('\n').pop())
}
