import fs from 'fs/promises'
import {from, switchMap} from 'rxjs'

import {interactive, sshCommandPath, userKeyFile} from './config.js'
import {interactive$} from './interactive.js'
import {nonInteractive$} from './nonInteractive.js'

process.on('uncaughtException', error => {
    console.error('Something went wrong, please try again', error)
    process.exit(1)
})

const session$ = interactive ? interactive$() : nonInteractive$()
session$.pipe(
    switchMap(session => writeSession$(session))
).subscribe()

const writeSession$ = session => {
    if (session) {
        const contents = `#!/usr/bin/env bash
        $(alive.sh ${session.id} > ~/alive.log 2>&1 &) && ssh \
        -i "${userKeyFile}" \
        -l "sepal-user" \
        -q \
        -oStrictHostKeyChecking=no \
        -oUserKnownHostsFile=/dev/null \
        -oBatchMode=yes \
        -p 222 \
        ${session.host} $1`
        return from(fs.writeFile(sshCommandPath, contents))
    } else {
        return from(fs.unlink(sshCommandPath))
    }
}
