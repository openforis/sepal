import {exec} from './exec.js'
import {exit, getModules, isNodeModule, showModuleStatus, MESSAGE} from './utils.js'
import {SEPAL_SRC} from './config.js'
import {getLibDepList} from './deps.js'
import Path from 'path'
import {access} from 'fs/promises'
import _ from 'lodash'
import {log} from './log.js'

const updatePackageList = async (module, path, {upgrade, target}) => {
    const modulePath = Path.join(SEPAL_SRC, path)
    showModuleStatus(module, MESSAGE.UPDATING_PACKAGES)
    const ncuOptions = [
        upgrade ? '--upgrade' : '',
        upgrade ? '--interactive' : '',
        '--target',
        target,
        '--color',
    ]

    try {
        await access(`${modulePath}/package.json`)
        await exec({
            command: 'ncu',
            args: [
                ...ncuOptions
            ],
            cwd: modulePath,
            enableStdIn: true,
            showStdOut: true,
            showStdErr: true
        })
    } catch (error) {
        log.warn(error)
    }

    showModuleStatus(module, MESSAGE.UPDATED_PACKAGES)
}

const updateModule = async (module, path, {upgrade, target} = {}) => {
    try {
        const modulePath = Path.join(SEPAL_SRC, path)
        if (await isNodeModule(modulePath)) {
            if (target) {
                await updatePackageList(module, path, {upgrade, target})
            }
        }
    } catch (error) {
        showModuleStatus(module, MESSAGE.ERROR)
        exit({error})
    }
}

export const npmUpdate = async (modules, options) => {
    const rootModules = getModules(modules)
    const libs = getLibDepList(rootModules)
    for (const lib of libs) {
        await updateModule(lib, `lib/js/${lib}`, options)
    }
    for (const module of rootModules) {
        await updateModule(module, `modules/${module}`, options)
    }
}
