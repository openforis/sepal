import {execFile} from 'node:child_process'

export const probeStartup = async ({main, boundary, homeDir, mountInfo, mountInfoError, environment}) => {
    const env = {...process.env, RABBITMQ_HOST: 'startup-test', HOME_DIR: homeDir}
    if (environment === undefined) {
        delete env.DEPLOY_ENVIRONMENT
    } else {
        env.DEPLOY_ENVIRONMENT = environment
    }
    const script = `
        import * as fs from 'node:fs/promises'
        import {mock} from 'node:test'

        const mountInfo = ${JSON.stringify(mountInfo)}
        const mountInfoError = ${JSON.stringify(mountInfoError)}
        if (mountInfo !== undefined || mountInfoError !== undefined) {
            await mock.module('node:fs/promises', {namedExports: {
                ...fs,
                readFile: async (path, ...args) => {
                    if (path !== '/proc/self/mountinfo') return fs.readFile(path, ...args)
                    if (mountInfoError !== undefined) throw new Error(mountInfoError)
                    return mountInfo
                }
            }})
        }
        await mock.module('#sepal/log', {namedExports: {
            configureServer: () => {},
            getLogger: () => ({
                debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
                fatal: error => console.error(error.message)
            })
        }})
        await mock.module(${JSON.stringify(boundary.module)}, {namedExports: {
            [${JSON.stringify(boundary.export)}]: () => {
                console.info('STARTUP_DEPENDENCY_REACHED')
                return new Promise(() => {})
            }
        }})
        await import(${JSON.stringify(main.href)})
    `
    return new Promise(resolve => {
        execFile(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', script], {
            cwd: new URL('..', main), env, timeout: 10_000
        }, (error, stdout, stderr) => resolve({status: error ? (error.code ?? 1) : 0, stdout, stderr}))
    })
}
