import {execFile} from 'child_process'
import os from 'os'
import {dirname} from 'path'
import {fileURLToPath} from 'url'
import {promisify} from 'util'

// Compose hands an unset ${VAR} to the container as an empty string.
describe('Earth Engine limits', () => {
    test('take their default when their variable is empty', async () => {
        const {eeLimits} = await loadConfig({EE_LIMIT_USER_RATE: '', EE_LIMIT_PROJECT_CONCURRENCY: ''})

        expect(eeLimits.user.maxRate).toBe(25)
        expect(eeLimits.project.maxConcurrency).toBe(40)
    })

    test('for task traffic take their defaults when their variables are empty', async () => {
        const {eeLimits} = await loadConfig({
            EE_LIMIT_TASK_USER_RATE: '', EE_LIMIT_TASK_USER_CONCURRENCY: '',
            EE_LIMIT_TASK_GLOBAL_RATE: '', EE_LIMIT_TASK_GLOBAL_CONCURRENCY: ''
        })

        expect(eeLimits.taskUser).toEqual({maxRate: 10, maxConcurrency: 5})
        expect(eeLimits.taskGlobal).toEqual({maxRate: 50, maxConcurrency: 20})
    })

    test('for task traffic are read from their variables', async () => {
        const {eeLimits} = await loadConfig({EE_LIMIT_TASK_USER_CONCURRENCY: '2', EE_LIMIT_TASK_GLOBAL_RATE: '30'})

        expect(eeLimits.taskUser.maxConcurrency).toBe(2)
        expect(eeLimits.taskGlobal.maxRate).toBe(30)
    })

    test('of the SEPAL project are those of other projects when their variables are empty', async () => {
        const {eeLimits} = await loadConfig({
            EE_LIMIT_PROJECT_RATE: '80',
            EE_LIMIT_SEPAL_PROJECT_RATE: '',
            EE_LIMIT_SEPAL_PROJECT_CONCURRENCY: ''
        })

        expect(eeLimits.sepalProject).toEqual({maxRate: 80, maxConcurrency: 40})
    })

    test('are read from variables that have a value', async () => {
        const {eeLimits} = await loadConfig({EE_LIMIT_SEPAL_PROJECT_RATE: '50', EE_LIMIT_GLOBAL_CONCURRENCY: '120'})

        expect(eeLimits.sepalProject.maxRate).toBe(50)
        expect(eeLimits.global.maxConcurrency).toBe(120)
    })

    test.each(['0', '-5', '2.5', '10abc', 'unlimited'])('refuse to start with %s', async value => {
        await expect(loadConfig({EE_LIMIT_USER_CONCURRENCY: value})).rejects.toMatchObject({
            code: 1,
            stdout: expect.stringContaining(`EE_LIMIT_USER_CONCURRENCY must be a positive integer, got: ${value}`)
        })
    })
})

describe('worker threads', () => {
    test('are half the cores, at least two, when their variable is empty', async () => {
        const {instances} = await loadConfig({INSTANCES: ''})

        expect(instances).toBe(Math.max(2, Math.floor(os.availableParallelism() / 2)))
    })

    test('are read from their variable when it has a value', async () => {
        const {instances} = await loadConfig({INSTANCES: '5'})

        expect(instances).toBe(5)
    })

    test.each(['0', '-1', '1.5', 'many'])('refuse to start with %s', async value => {
        await expect(loadConfig({INSTANCES: value})).rejects.toMatchObject({
            code: 1,
            stdout: expect.stringContaining(`INSTANCES must be a positive integer, got: ${value}`)
        })
    })
})

describe('the SEPAL host', () => {
    test('is required, since it names every user\'s export bucket', async () => {
        await expect(loadConfig({SEPAL_HOST: ''})).rejects.toMatchObject({
            code: 1,
            stdout: expect.stringContaining('--sepal-host')
        })
    })
})

const MODULE_DIR = dirname(dirname(fileURLToPath(import.meta.url)))

const REQUIRED_ENV = {
    SEPAL_ENDPOINT: 'https://sepal.test',
    SEPAL_HOST: 'sepal.test',
    GOOGLE_PROJECT_ID: 'sepal-test-project',
    EE_ACCOUNT: 'sepal@sepal-test-project.iam.gserviceaccount.com',
    EE_PRIVATE_KEY: 'test-key'
}

// The configuration is parsed from the environment when config.js is first imported.
const loadConfig = async env => {
    const script = 'const config = await import("./src/config.js"); console.log(JSON.stringify({...config}))'
    const {stdout} = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', script], {
        cwd: MODULE_DIR,
        env: {PATH: process.env.PATH, ...REQUIRED_ENV, ...env}
    })
    return JSON.parse(stdout.trim().split('\n').pop())
}
