import {spawnSync} from 'child_process'
import {join} from 'path'

import {dirName} from '#sepal/path'

describe('ssh-bootstrap', () => {
    test('prints the routing error and exits without starting the menu', () => {
        const result = runBootstrap({SEPAL_ROUTING_ERROR: 'No running instance named funky-name.'})

        expect(result.stderr).toBe('No running instance named funky-name.\n')
        expect(result.stdout).toBe('')
        expect(result.status).toBe(1)
    })
})

// USER is unset and the module directory does not exist here, so a bootstrap that went on past the check
// would fail on its own, differently — the assertions above tell the two apart.
const runBootstrap = env =>
    spawnSync('bash', [BOOTSTRAP], {env: {PATH: process.env.PATH, ...env}, encoding: 'utf8'})

const BOOTSTRAP = join(dirName(import.meta.url), '../script/ssh-bootstrap')
