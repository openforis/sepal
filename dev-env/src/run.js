import {exec} from './exec.js'
import {exit, isModule, isRunnable, isRunning, showModuleStatus, STATUS} from './utils.js'
import {start} from './start.js'
import {SEPAL_SRC, ENV_FILE} from './config.js'

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
            } else {
                showModuleStatus(module, STATUS.NON_RUNNABLE)
            }
        }
    } catch (error) {
        showModuleStatus(module, STATUS.ERROR)
        exit({error})
    }
}

export const run = async (module, options) => {
    await start(module, {stop: true}) 
    await runModule(module, options)
}
