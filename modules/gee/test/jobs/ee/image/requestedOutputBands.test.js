import {spawnSync} from 'child_process'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

// A bridge, not a test of its own. The behavioral witness lives in the sibling .mjs and runs under Node's own
// test runner, because imageFactory loads its implementations through createRequire: real Node supports
// require(esm), Jest's CJS resolver answers ERR_REQUIRE_ESM and the factory throws before a reference can
// resolve. Launching it from here keeps the witness inside the ordinary `sepal npm-test gee` gate.
const WITNESS = join(dirname(fileURLToPath(import.meta.url)), 'requestedOutputBands.node.test.mjs')

// Bounds rather than waits. --test-timeout stops the child at the case it is stuck in and names it;
// spawnSync's own timeout is the backstop for a child that never gets that far, and --test-isolation=none
// keeps the witness in the process being bounded, so nothing survives it.
const CASE_TIMEOUT_MS = 15000
const CHILD_TIMEOUT_MS = 60000

it('returns the output bands an image export names', () => {
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
    // The child's own report is the diagnosis. A bare status code would say a witness failed without saying
    // which assertion or what it saw, so it is raised rather than compared away.
    if (status !== 0) {
        throw new Error(
            `${WITNESS} failed - status ${status}, signal ${signal}${error ? `, ${error.message}` : ''}`
            + `\n\n${stdout}\n${stderr}`
        )
    }
    expect(status).toBe(0)
}, 120000)
