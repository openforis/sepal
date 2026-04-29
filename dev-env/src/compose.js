import {ENV_FILE} from './config.js'
import {exec} from './exec.js'
import {modulePath} from './utils.js'
import _ from 'lodash'

export const compose = async ({module, command, args, files, env, enableStdIn, showStdOut, showStdErr}) =>
    await exec({
        command: 'docker',
        args: [
            'compose',
            `--env-file=${ENV_FILE}`,
            ..._.map(files, file => `--file=${file}`),
            command,
            ..._.compact(args)
        ],
        cwd: modulePath(module),
        env,
        enableStdIn,
        showStdOut,
        showStdErr
    })
