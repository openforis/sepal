import {compose} from './compose.js'
import {exit, isModule, isRunnable, isRunning, showModuleStatus, MESSAGE} from './utils.js'
import _ from 'lodash'

const shellModule = async (module, service, options = {}, _parent) => {
    if (isModule(module)) {
        if (isRunnable(module)) {
            const serviceName = `${module}${_.isEmpty(service) ? '' : `-${service}`}`
            if (await isRunning(module, serviceName)) {
                await compose({
                    module,
                    command: 'exec',
                    args: [
                        options.root ? '--user=root' : null,
                        serviceName,
                        'bash'
                    ],
                    enableStdIn: true,
                    showStdOut: true,
                    showStdErr: true
                })
            }
        } else {
            showModuleStatus(module, MESSAGE.NON_RUNNABLE)
        }
    }
}

export const shell = async (module, service, options) => {
    await shellModule(module, service, options)
}
