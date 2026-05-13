import {access} from 'fs/promises'
import _ from 'lodash'
import Path from 'path'

import {compose} from './compose.js'
import {SEPAL_SRC, USER_GID, USER_UID} from './config.js'
import {isNodeModule, MESSAGE, showModuleStatus} from './utils.js'

const runTests = async (module, modulePath, testArgs) => {
    showModuleStatus(module, MESSAGE.TESTING_PACKAGES)
    await access(`${modulePath}/package.json`)
    await compose({
        module,
        command: 'run',
        args: [
            `--user=${USER_UID}:${USER_GID}`,
            '--rm',
            module,
            'npm',
            'run',
            'test',
            ...(_.isEmpty(testArgs) ? [] : ['--', ...testArgs])
        ],
        showStdOut: true,
        showStdErr: true
    })
    showModuleStatus(module, MESSAGE.TESTED_PACKAGES)
}

const testModule = async (module, path, testArgs) => {
    const modulePath = Path.join(SEPAL_SRC, path)
    if (await isNodeModule(modulePath)) {
        await runTests(module, modulePath, testArgs)
    }
}

export const npmTest = async (module, testArgs = []) => {
    await testModule(module, `modules/${module}`, testArgs)
}
