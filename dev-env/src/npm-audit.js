import {getModules, isNodeModule, showModuleStatus, MESSAGE} from './utils.js'
import {SEPAL_SRC, USER_GID, USER_UID} from './config.js'
import {access} from 'fs/promises'
import _ from 'lodash'
import {compose} from './compose.js'
import { stopModule } from './stop.js'

const auditModulePackages = async (module, {fix}) => {
    const modulePath = `${SEPAL_SRC}/modules/${module}`
    await access(`${modulePath}/package.json`)
    await compose({
        module,
        command: 'run',
        args: [
            `--user=${USER_UID}:${USER_GID}`,
            '--rm',
            module,
            'npm',
            'audit',
            fix ? 'fix' : '',
            '--install-links=false'
        ],
        showStdOut: true
    })
}

const auditModule = async (module, options) => {
    const modulePath = `${SEPAL_SRC}/modules/${module}`
    if (await isNodeModule(modulePath)) {
        await stopModule(module)
        showModuleStatus(module, MESSAGE.AUDITING_PACKAGES)
        await auditModulePackages(module, options)
        showModuleStatus(module, MESSAGE.AUDITED_PACKAGES)
    }
}

export const npmAudit = async (modules, options) => {
    const rootModules = getModules(modules, [':node'])
    for (const module of rootModules) {
        await auditModule(module, options)
    }
}
