import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, test} from 'node:test'

import {dirName} from '#sepal/path'

describe('ssh-bootstrap', () => {
    test('prints the routing error and exits without starting the menu', () => {
        const result = runBootstrap({SEPAL_ROUTING_ERROR: 'No running instance named funky-name.'})

        assert.equal(result.stderr, 'No running instance named funky-name.\n')
        assert.equal(result.stdout, '')
        assert.equal(result.status, 1)
    })

    test('hands the ssh command to the session script as one argument, without evaluating it', () => {
        const fakeBin = mkdtempSync(join(tmpdir(), 'ssh-bootstrap-'))
        writeFileSync(join(fakeBin, 'node'), FAKE_MENU, {mode: 0o755})
        const command = '"; echo injected; "$(echo injected)'

        const result = runBootstrap({
            PATH: `${fakeBin}:${process.env.PATH}`,
            USER: 'alice',
            SSH_ORIGINAL_COMMAND: command
        })

        assert.equal(result.stdout, `${command}\n`)
        assert.equal(result.status, 0)
    })
})

// Stands in for the menu: it writes a session script that prints each argument on its own line.
const FAKE_MENU = `#!/usr/bin/env bash
for arg; do case $arg in --ssh-command-path=*) path=\${arg#*=};; esac; done
printf '#!/usr/bin/env bash\\nprintf "%%s\\\\n" "$@"\\n' > "$path"
`

// USER is unset and the module directory does not exist here, so a bootstrap that went on past the check
// would fail on its own, differently — the assertions above tell the two apart.
const runBootstrap = env =>
    spawnSync('bash', [BOOTSTRAP], {env: {PATH: process.env.PATH, ...env}, encoding: 'utf8'})

const BOOTSTRAP = join(dirName(import.meta.url), '../script/ssh-bootstrap')
