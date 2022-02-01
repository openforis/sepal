import {exec} from './exec.js'
import {isModule, isRunnable, isRunning, showModuleStatus, STATUS} from './utils.js'
import {restart} from './restart.js'
import {SEPAL_SRC, ENV_FILE} from './config.js'
import {log} from './log.js'

const runModule = async (module, options = {}, _parent) => {
    try {
        if (isModule(module)) {
            if (isRunnable(module)) {
                if (await isRunning(module)) {
                    await exec({
                        command: './script/docker-compose-logs.sh',
                        args: [module, SEPAL_SRC, ENV_FILE],
                        showStdOut: true
                    })
                }
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

export const run = async (module, options) => {
    await restart(module, options) 
    await runModule(module, options)
}
