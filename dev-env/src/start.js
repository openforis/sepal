import {compose} from './compose.js'
import {exec} from './exec.js'
import {getModules, isModule, isRunnable, isGradleModule, showModuleStatus, MESSAGE, getStatus, showStatus, isRunning, modulePath} from './utils.js'
import {logs} from './logs.js'
import {getDirectRunDeps} from './deps.js'
import {SEPAL_SRC} from './config.js'
import _ from 'lodash'

const startModule = async (module, options = {}, rootModule, gradleOptions) => {
    if (isModule(module)) {
        if (isRunnable(module)) {
            if (gradleOptions.build && isGradleModule(module) && !await isRunning(module)) {
                showModuleStatus('gradle', MESSAGE.BUILDING, {sameLine: true})

                await exec({
                    command: 'gradle',
                    args: [
                        '-x',
                        'test',
                        'build'
                    ],
                    cwd: SEPAL_SRC,
                    showStdOut: options.verbose
                })

                showModuleStatus('gradle', MESSAGE.BUILT)
                gradleOptions.build = false
            }

            showModuleStatus(module, MESSAGE.STARTING, {sameLine: true})

            await compose({
                module,
                command: 'up',
                args: [
                    '--detach'
                ],
                showStdOut: options.verbose
            })
            if (rootModule && (options.log || options.logTail)) {
                await showStatus([module])
                await logs(module, options.logTail ? {follow: true, tail: true} : undefined)
            } else {
                await waitModuleRunning(module)
            }
        } else {
            showModuleStatus(module, MESSAGE.NON_RUNNABLE)
        }
    }
}

const waitModuleRunning = async module =>
    new Promise((resolve, reject) => {
        const wait = async (count = 0) => {
            const foo = await getStatus([module], true)
            const [{status, services}] = foo
            if (status) {
                if (services) {
                    if (_.some(services, ({state, health}) => state === 'RUNNING' && health === 'UNHEALTHY')) {
                        showModuleStatus(module, status, {sameLine: false})
                        return reject(`Cannot start module ${module}`)
                    }
                    if (_.every(services, ({state, health}) => state === 'RUNNING' && (health === '' || health === 'HEALTHY'))) {
                        showModuleStatus(module, status, {sameLine: false})
                        return resolve()
                    }
                    showModuleStatus(module, [status, '.'.repeat(count)].join(' '), {sameLine: true})
                    setTimeout(() => wait(count + 1), 1000)
                }
            } else {
                showModuleStatus(module, MESSAGE.STOPPED)
                return resolve()
            }
        }
        wait()
    })

const getModulesToStart = (modules, options = {}) => {
    const dependencies = _.flatten(
        modules.map(module =>
            getModulesToStart(getDirectRunDeps(module), options)
        )
    )

    return [
        ...dependencies,
        ...modules
    ]
}

export const start = async (modules, options) => {
    const rootModules = getModules(modules)
    const startModules = _.uniq(getModulesToStart(rootModules, options))
    const gradleOptions = {build: true}

    for (const module of startModules) {
        await startModule(module, options, rootModules.includes(module), gradleOptions)
    }
}
