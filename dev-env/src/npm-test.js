import {exec} from './exec.js'
import {isNodeModule, showModuleStatus, MESSAGE} from './utils.js'
import {SEPAL_SRC} from './config.js'
import Path from 'path'
import {access} from 'fs/promises'
import _ from 'lodash'

const runTests = async (module, modulePath, _options) => {
    showModuleStatus(module, MESSAGE.TESTING_PACKAGES)
    await access(`${modulePath}/package.json`)
    await exec({
        command: 'npm',
        args: [
            'run',
            'test'
        ],
        cwd: modulePath,
        enableStdIn: true,
        showStdOut: true,
        showStdErr: true
    })
    showModuleStatus(module, MESSAGE.TESTED_PACKAGES)
}

const testModule = async (module, path, options) => {
    const modulePath = Path.join(SEPAL_SRC, path)
    if (await isNodeModule(modulePath)) {
        await runTests(module, modulePath, options)
    }
}

export const npmTest = async (module, options) => {
    await testModule(module, `modules/${module}`, options)
}
