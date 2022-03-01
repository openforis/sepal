import {exec} from './exec.js'
import {exit, getModules, isNodeModule, showModuleStatus, MESSAGE} from './utils.js'
import {SEPAL_SRC} from './config.js'
import Path from 'path'
import _ from 'lodash'

const updatePackageList = async (module, path, {check, target}) => {
    const modulePath = Path.join(SEPAL_SRC, path)
    showModuleStatus(module, MESSAGE.UPDATING_PACKAGES)
    const ncuOptions = [
        check ? '' : '--upgrade',
        check ? '' : '--interactive',
        `--target ${target}`,
        '--color',
    ].join(' ')
    await exec({
        command: './script/npm-check-updates.sh',
        args: [modulePath, ncuOptions],
        enableStdIn: true,
        showStdOut: true,
        showStdErr: true
    })
    showModuleStatus(module, MESSAGE.UPDATED_PACKAGES)
}

const updateModule = async (module, path, {check, target} = {}) => {
    try {
        const modulePath = Path.join(SEPAL_SRC, path)
        if (await isNodeModule(modulePath)) {
            if (target) {
                await updatePackageList(module, path, {check, target})
            }
        }
    } catch (error) {
        showModuleStatus(module, MESSAGE.ERROR)
        exit({error})
    }
}

export const npmUpdate = async (modules, options) => {
    await updateModule('shared', 'lib/js/shared', options)
    for (const module of getModules(modules)) {
        await updateModule(module, `modules/${module}`, options)
    }
}
