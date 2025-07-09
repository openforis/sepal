import {exec} from './exec.js'
import {getModules, isNodeModule, showModuleStatus, MESSAGE} from './utils.js'
import {SEPAL_SRC} from './config.js'
import {getLibDepList} from './deps.js'
import Path from 'path'
import _ from 'lodash'

const runEslint = async (module, modulePath, {fix}) => {
    showModuleStatus(module, MESSAGE.CHECKING_PACKAGES)
    try {
        await exec({
            command: Path.join(SEPAL_SRC, 'node_modules/eslint/bin/eslint.js'),
            args: [
                'src',
                fix ? '--fix' : ''
            ].filter(Boolean),
            cwd: modulePath,
            enableStdIn: true,
            showStdOut: true,
            showStdErr: true
        })
    } catch (err) {}
    showModuleStatus(module, MESSAGE.CHECKED_PACKAGES)
}

const eslintModule = async (module, path, options) => {
    const modulePath = Path.join(SEPAL_SRC, path)
    if (await isNodeModule(modulePath)) {
        await runEslint(module, modulePath, options)
    }
}

export const eslint = async (modules, options) => {
    const rootModules = getModules(modules, [':node'])
    const libs = getLibDepList(rootModules)
    for (const lib of libs) {
        await eslintModule(lib, `lib/js/${lib}`, options)
    }
    for (const module of rootModules) {
        await eslintModule(module, `modules/${module}`, options)
    }
}
