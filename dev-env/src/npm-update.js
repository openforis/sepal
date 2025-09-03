import {exec} from './exec.js'
import {getModules, isNodeModule, showModuleStatus, MESSAGE} from './utils.js'
import {SEPAL_SRC} from './config.js'
import {getLibDepList} from './deps.js'
import Path from 'path'
import {access} from 'fs/promises'
import _ from 'lodash'

const updatePackageList = async (module, path, {upgrade, target}) => {
    const modulePath = Path.join(SEPAL_SRC, path)
    showModuleStatus(module, MESSAGE.UPDATING_PACKAGES)

    await access(`${modulePath}/package.json`)
    await exec({
        command: 'ncu',
        args: [
            upgrade ? '--upgrade' : '',
            upgrade ? '--interactive' : '',
            '--target',
            target,
            '--color',
            '--format', 'group',
            '--install', 'never',
        ],
        cwd: modulePath,
        enableStdIn: true,
        showStdOut: true,
        showStdErr: true
    })

    showModuleStatus(module, MESSAGE.UPDATED_PACKAGES)
}

const updateModule = async (module, path, {upgrade, target} = {}) => {
    const modulePath = Path.join(SEPAL_SRC, path)
    if (await isNodeModule(modulePath)) {
        if (target) {
            await updatePackageList(module, path, {upgrade, target})
        }
    }
}

export const npmUpdate = async (modules, options) => {
    const rootModules = getModules(modules, [':node'])
    const libs = getLibDepList(rootModules)
    for (const lib of libs) {
        await updateModule(lib, `lib/js/${lib}`, options)
    }
    for (const module of rootModules) {
        await updateModule(module, `modules/${module}`, options)
    }
}
