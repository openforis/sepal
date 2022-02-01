import {exec} from './exec.js'
import {getModules, isModule, isRunnable, isRunning, showModuleStatus, showStatus, STATUS} from './utils.js'
import {getInverseRunDeps} from './deps.js'
import {SEPAL_SRC, ENV_FILE} from './config.js'
import {log} from './log.js'

const stopDeps = async (module, options) => {
    const deps = getInverseRunDeps(module)
    if (deps.length) {
        for (const dep of deps) {
            await stopModule(dep, options, module)
        }
    }
}

export const stopModule = async (module, options = {}, _parent) => {
    try {
        if (isModule(module)) {
            if (isRunnable(module)) {
                if (options.recursive) {
                    await stopDeps(module, options)
                }
                if (await isRunning(module)) {
                    showModuleStatus(module, STATUS.STOPPING)
                    await exec({
                        command: './script/docker-compose-down.sh',
                        args: [module, SEPAL_SRC, ENV_FILE],
                        showStdOut: options.verbose
                    })
                }
                await showStatus([module], options)
                return true
            } else {
                showModuleStatus(module, STATUS.NON_RUNNABLE)
                return false
            }
        }
    } catch (error) {
        showModuleStatus(module, STATUS.ERROR)
        log.error(error.stderr || error)
        return false
    }
}

export const stop = async (modules, options) => {
    for (const module of getModules(modules)) {
        await stopModule(module, options)
    }
}
