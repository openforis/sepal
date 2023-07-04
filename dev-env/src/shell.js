import {exec} from './exec.js'
import {exit, isModule, isRunnable, isRunning, showModuleStatus, MESSAGE} from './utils.js'
import {SEPAL_SRC, ENV_FILE} from './config.js'
import _ from 'lodash'

const shellModule = async (module, service, options = {}, _parent) => {
    try {
        if (isModule(module)) {
            if (isRunnable(module)) {
                const serviceName = `${module}${_.isEmpty(service) ? '' : `-${service}`}`
                if (await isRunning(module, serviceName)) {
                    const shellOptions = _.compact([
                        options.root ? '--user=root' : null
                    ]).join(' ')
                    await exec({
                        command: './script/docker-compose-shell.sh',
                        args: [module, serviceName, SEPAL_SRC, ENV_FILE, shellOptions],
                        enableStdIn: true,
                        showStdOut: true,
                        showStdErr: true
                    })
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

export const shell = async (module, service, options) => {
    await shellModule(module, service, options)
}
