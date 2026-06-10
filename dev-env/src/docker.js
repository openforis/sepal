import _ from 'lodash'

import {exec} from './exec.js'

export const hasComposeOverride = async module => {
    const out = await exec({
        command: 'docker',
        args: [
            'ps',
            '--filter',
            `label=com.docker.compose.project=${module}`,
            '--format',
            '{{.Label "com.docker.compose.project.config_files"}}'
        ]
    })
    return out
        .split('\n')
        .filter((line, index) => index === 0)
        .map(line => line.split(','))
        .flat()
        .some(file => file.endsWith('docker-compose.override.yml'))
}

export const listModules = async () =>
    await exec({
        command: 'docker',
        args: [
            'compose',
            'ls',
            '--all',
            '--format',
            'json'
        ]
    })
