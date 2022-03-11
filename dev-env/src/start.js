import {exec} from './exec.js'
import {exit, getModules, isModule, isRunnable, showModuleStatus, MESSAGE, waitModuleRunning, showStatus} from './utils.js'
import {logs} from './logs.js'
import {getDirectRunDeps} from './deps.js'
import {SEPAL_SRC, ENV_FILE} from './config.js'
import _ from 'lodash'

const startModule = async (module, options = {}, rootModule) => {
    try {
        if (isModule(module)) {
            if (isRunnable(module)) {
                showModuleStatus(module, MESSAGE.STARTING, {sameLine: true})
                await exec({
                    command: './script/docker-compose-up.sh',
                    args: [module, SEPAL_SRC, ENV_FILE],
                    showStdOut: options.verbose
                })
                if (rootModule && options.showLogs) {
                    await showStatus([module])
                    await logs(module, {follow: true})
                } else {
                    await waitModuleRunning(module)
                }
            } else {
                showModuleStatus(module, MESSAGE.NON_RUNNABLE)
            }
        }
    } catch (error) {
        showModuleStatus(module, MESSAGE.ERROR)
        exit({error})
    }
}

const getModulesToStart = (modules, options = {}) => {
    const dependencies = options.dependencies
        ? _.flatten(
            modules.map(module =>
                getModulesToStart(getDirectRunDeps(module), options)
            )
        )
        : []

    return [
        ...dependencies,
        ...modules
    ]
}

export const start = async (modules, options) => {
    const rootModules = getModules(modules)
    const startModules = _.uniq(getModulesToStart(rootModules, options))
    for (const module of startModules) {
        await startModule(module, options, rootModules.includes(module))
    }
}
