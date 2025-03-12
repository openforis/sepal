import {compose} from './compose.js'
import {exec} from './exec.js'
import {getModules, isModule, isRunnable, isGradleModule, showModuleStatus, MESSAGE, getStatus, showStatus, isRunning, multi} from './utils.js'
import {logs} from './logs.js'
import {getRunDependencyMap} from './deps.js'
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

            if (rootModule && (options.log || options.logFollow || options.logRecent || options.logTail)) {
                await showStatus([module])
                await logs(module, {
                    follow: options.logFollow,
                    recent: options.logRecent,
                    tail: options.logTail
                })
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
            const [{status, services}] = await getStatus([module], true)
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

const startModules = async (rootModules, options, gradleOptions, dependencyMap = getRunDependencyMap(rootModules, options)) => {
    const independentModules = _(dependencyMap)
        .pickBy(dependencies => dependencies.length === 0)
        .keys()
        .value()

    await multi(independentModules, async module => await startModule(module, options, rootModules.includes(module), gradleOptions), options.sequential)

    const updatedDependencyMap = _(dependencyMap)
        .omit(independentModules)
        .mapValues(dependencies => _.difference(dependencies, independentModules))
        .value()

    if (!_.isEmpty(updatedDependencyMap)) {
        await startModules(rootModules, options, gradleOptions, updatedDependencyMap)
    }
}

export const start = async (modules, options) => {
    const rootModules = getModules(modules)
    const gradleOptions = {build: true}
    await startModules(rootModules, options, gradleOptions)
}
