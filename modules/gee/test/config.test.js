import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import os from 'node:os'
import {dirname} from 'node:path'
import {describe, test} from 'node:test'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

// Compose hands an unset ${VAR} to the container as an empty string.
describe('Earth Engine limits', () => {
    test('take their default when their variable is empty', async () => {
        const {eeLimits} = await loadConfig({EE_LIMIT_USER_RATE: '', EE_LIMIT_USER_PROJECT_CONCURRENCY: ''})

        assert.equal(eeLimits.user.maxRate, 25)
        assert.equal(eeLimits.userProject.maxConcurrency, 40)
    })

    test('for task traffic take their defaults when their variables are empty', async () => {
        const {eeLimits} = await loadConfig({
            EE_LIMIT_TASK_USER_RATE: '', EE_LIMIT_TASK_USER_CONCURRENCY: '',
            EE_LIMIT_TASK_GLOBAL_RATE: '', EE_LIMIT_TASK_GLOBAL_CONCURRENCY: ''
        })

        assert.deepEqual(eeLimits.taskUser, {maxRate: 10, maxConcurrency: 5})
        assert.deepEqual(eeLimits.taskGlobal, {maxRate: 50, maxConcurrency: 20})
    })

    test('for task traffic are read from their variables', async () => {
        const {eeLimits} = await loadConfig({EE_LIMIT_TASK_USER_CONCURRENCY: '2', EE_LIMIT_TASK_GLOBAL_RATE: '30'})

        assert.equal(eeLimits.taskUser.maxConcurrency, 2)
        assert.equal(eeLimits.taskGlobal.maxRate, 30)
    })

    test('of the SEPAL project are those of user projects when their variables are empty', async () => {
        const {eeLimits} = await loadConfig({
            EE_LIMIT_USER_PROJECT_RATE: '80',
            EE_LIMIT_SEPAL_PROJECT_RATE: '',
            EE_LIMIT_SEPAL_PROJECT_CONCURRENCY: ''
        })

        assert.deepEqual(eeLimits.sepalProject, {maxRate: 80, maxConcurrency: 40})
    })

    test('are read from variables that have a value', async () => {
        const {eeLimits} = await loadConfig({EE_LIMIT_SEPAL_PROJECT_RATE: '50', EE_LIMIT_GLOBAL_CONCURRENCY: '120'})

        assert.equal(eeLimits.sepalProject.maxRate, 50)
        assert.equal(eeLimits.global.maxConcurrency, 120)
    })

    for (const value of ['0', '-5', '2.5', '10abc', 'unlimited']) {
        test(`refuse to start with ${value}`, async () => {
            await assert.rejects(loadConfig({EE_LIMIT_USER_CONCURRENCY: value}), error => {
                assert.equal(error.code, 1)
                assert.ok(error.stdout.includes(`EE_LIMIT_USER_CONCURRENCY must be a positive integer, got: ${value}`))
                return true
            })
        })
    }
})

describe('worker threads', () => {
    test('are half the cores, at least two, when their variable is empty', async () => {
        const {instances} = await loadConfig({INSTANCES: ''})

        assert.equal(instances, Math.max(2, Math.floor(os.availableParallelism() / 2)))
    })

    test('are read from their variable when it has a value', async () => {
        const {instances} = await loadConfig({INSTANCES: '5'})

        assert.equal(instances, 5)
    })

    for (const value of ['0', '-1', '1.5', 'many']) {
        test(`refuse to start with ${value}`, async () => {
            await assert.rejects(loadConfig({INSTANCES: value}), error => {
                assert.equal(error.code, 1)
                assert.ok(error.stdout.includes(`INSTANCES must be a positive integer, got: ${value}`))
                return true
            })
        })
    }
})

describe('the SEPAL host', () => {
    test('is required, since it names every user\'s export bucket', async () => {
        await assert.rejects(loadConfig({SEPAL_HOST: ''}), error => {
            assert.equal(error.code, 1)
            assert.ok(error.stdout.includes('--sepal-host'))
            return true
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
