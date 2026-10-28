import {exec} from './exec.js'

export const prune = async ({dryRun}) =>
    dryRun
        ? await exec({
            command: 'docker',
            args: ['images', '--filter', 'dangling=true', '--format', 'table {{.ID}}\t{{.CreatedSince}}\t{{.Size}}'],
            showStdOut: true
        })
        : await exec({
            command: 'docker',
            args: ['image', 'prune', '--force'],
            showStdOut: true,
            showStdErr: true
        })
