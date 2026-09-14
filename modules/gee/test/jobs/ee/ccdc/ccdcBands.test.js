import {spawnSync} from 'child_process'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

// imageFactory's lazy require(esm) needs Node's runtime rather than Jest's CJS resolver.
const WITNESS = join(dirname(fileURLToPath(import.meta.url)), 'ccdcBands.node.test.mjs')

// Bounds rather than waits. --test-timeout stops the child at the case it is stuck in and names it;
// spawnSync's own timeout is the backstop for a child that never gets that far, and --test-isolation=none
// keeps the witness in the process being bounded, so nothing survives it.
const CASE_TIMEOUT_MS = 15000
const CHILD_TIMEOUT_MS = 60000

it('discovers CCDC and Slice bands through the real source adapters', () => {
    const {status, signal, error, stdout, stderr} = spawnSync(
        process.execPath,
        [
            '--experimental-test-module-mocks',
            '--test-isolation=none',
            `--test-timeout=${CASE_TIMEOUT_MS}`,
            '--test',
            WITNESS
        ],
        {encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL'}
    )
    if (status !== 0) {
        throw new Error(
            `${WITNESS} failed - status ${status}, signal ${signal}${error ? `, ${error.message}` : ''}`
            + `\n\n${stdout}\n${stderr}`
        )
    }
    expect(status).toBe(0)
}, 120000)
