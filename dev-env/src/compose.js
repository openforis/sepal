import _ from 'lodash'

import {ENV_FILE} from './config.js'
import {exec} from './exec.js'
import {modulePath} from './utils.js'

export const compose = async ({module, command, args, env, noOverride, enableStdIn, showStdOut, showStdErr}) =>
    await exec({
        command: 'docker',
        args: [
            'compose',
            `--env-file=${ENV_FILE}`,
            ..._.map(noOverride ? ['docker-compose.yml'] : undefined, file => `--file=${file}`),
            command,
            ..._.compact(args)
        ],
        cwd: modulePath(module),
        env,
        enableStdIn,
        showStdOut,
        showStdErr
    })
