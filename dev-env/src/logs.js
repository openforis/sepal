import _ from 'lodash'

import {compose} from './compose.js'
import {getModules, isModule, isRunnable, MESSAGE, showModuleStatus} from './utils.js'

const logsModule = async (module, options) => {
    if (isModule(module)) {
        if (isRunnable(module)) {
            const {logFollow, logTail, logRecent, follow = logFollow, tail = logTail, recent = logRecent, since, until} = options
            await compose({
                module,
                command: 'logs',
                args: [
                    tail || recent || follow ? '--follow' : null,
                    tail ? '--since=0s' : null,
                    recent ? '--tail=20' : null,
                    since ? `--since=${since}` : null,
                    until ? `--until=${until}` : null
                ],
                showStdOut: true
            })
        } else {
            showModuleStatus(module, MESSAGE.NON_RUNNABLE)
        }
    }
}

export const logs = async (modules, options) => {
    for (const module of getModules(modules)) {
        await logsModule(module, options)
    }
}
