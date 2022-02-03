import {exec} from './exec.js'
import {startDeps} from './start.js'
import {getModules, isModule, isRunnable, isRunning, showModuleStatus, showStatus, STATUS} from './utils.js'
import {SEPAL_SRC, ENV_FILE} from './config.js'
import {log} from './log.js'

const restartModule = async (module, options = {}, _parent) => {
    try {
        if (isModule(module)) {
            if (isRunnable(module)) {
                await startDeps(module, options)
                if (await isRunning(module)) {
                    showModuleStatus(module, STATUS.STOPPING)
                    await exec({
                        command: './script/docker-compose-down.sh',
                        args: [module, SEPAL_SRC, ENV_FILE],
                        showStdOut: options.verbose
                    })
                }
                if (!await isRunning(module)) {
                    showModuleStatus(module, STATUS.STARTING)
                    await exec({
                        command: './script/docker-compose-up.sh',
                        args: [module, SEPAL_SRC, ENV_FILE],
                        showStdOut: options.verbose
                    })
                }
                await showStatus([module], options)
            } else {
                showModuleStatus(module, STATUS.NON_RUNNABLE)
            }
        }
    } catch (error) {
        showModuleStatus(module, STATUS.ERROR)
        log.error(error.stderr || error)
    }
}

export const restart = async (modules, options) => {
    for (const module of getModules(modules)) {
        await restartModule(module, options)
    }
}
