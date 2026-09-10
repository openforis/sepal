import fs from 'fs/promises'
import {from, of, switchMap, tap} from 'rxjs'

import {configureNoLogging} from '#sepal/log'

import {interactive, sshCommandPath, userKeyFile, username} from './config.js'
import {closeConsole, setTitle} from './console.js'
import {sessionLabel$, terminalOpened$} from './endpoint.js'
import {interactive$} from './interactive.js'
import {nonInteractive$} from './nonInteractive.js'
import {closeSessionEvents, initSessionEvents} from './sessionEvents.js'

configureNoLogging() // stdout is the user's terminal — log output would corrupt it

process.on('uncaughtException', error => {
    console.error('Something went wrong, please try again', error)
    process.exit(1)
})

// The menu belongs to no session, so drop whatever name the previous one left on the GUI's tab.
if (interactive) {
    setTitle('')
}

const session$ = interactive
    ? interactive$(initSessionEvents(username))
    : nonInteractive$()
session$.pipe(
    switchMap(session => writeSession$(session))
).subscribe({
    // Expected failures (instance unavailable, budget exceeded) are handled upstream and
    // complete the stream — an error here is unexpected: tell the user concisely instead
    // of letting the raw error dump into their terminal via uncaughtException.
    error: () => {
        console.error('\nSomething went wrong, please try again.')
        process.exit(1)
    },
    // the open AMQP connection and the shared readline interface would otherwise
    // keep the process (and ssh-bootstrap) waiting
    complete: () => {
        closeSessionEvents()
        closeConsole()
    }
})

const writeSession$ = session => {
    if (session) {
        // A session going away makes the ssh client print "Connection to <host> closed by remote
        // host." — a fatal error, so -q does not cover it, and it now contradicts the terminated
        // notice ssh-bootstrap prints. Filter that one line rather than dropping stderr: a sandbox
        // that cannot be reached still has to say so. Interactive only — there the remote's own
        // stderr rides the pty channel, while a non-interactive command has no pty and needs its
        // stderr untouched.
        const contents = `#!/usr/bin/env bash
        # session-id: ${session.id}
        ssh \
        -i "${userKeyFile}" \
        -l "sepal-user" \
        -q \
        -oStrictHostKeyChecking=no \
        -oUserKnownHostsFile=/dev/null \
        -oBatchMode=yes \
        -p 222 \
        ${session.host} $1${interactive ? ' 2> >(grep -v "closed by remote host" >&2)' : ''}`
        // The one-shot "terminal opened" extension, before handing the user their shell: from
        // here on the terminal's liveness comes from pty atime sampled inside the container, and
        // nothing keeps an untouched connection alive.
        return terminalOpened$(session).pipe(
            // Name the GUI's terminal tab after the session the user is about to enter. Skipped in
            // non-interactive mode, where stdout is the output of the command the user ran.
            switchMap(() => interactive ? sessionLabel$(session) : of(null)),
            tap(label => label && setTitle(label)),
            switchMap(() => from(fs.writeFile(sshCommandPath, contents)))
        )
    } else {
        return from(fs.unlink(sshCommandPath))
    }
}
