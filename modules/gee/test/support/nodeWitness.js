import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

// Runs a behavioral witness under Node's own test runner from a Jest test, which is then a bridge rather than a test
// of its own. imageFactory loads its implementations through createRequire: real Node supports require(esm), Jest's
// CJS resolver answers ERR_REQUIRE_ESM and the factory throws before a reference can resolve. Launching the witness
// keeps it inside the ordinary `sepal npm-test gee` gate while exercising the module loading production performs.
//
// Bounds rather than waits. --test-timeout stops the child at the case it is stuck in and names it; spawnSync's own
// timeout is the backstop for a child that never gets that far, and --test-isolation=none keeps the witness in the
// process being bounded, so nothing survives it. A bridge gives its Jest test WITNESS_TIMEOUT_MS, beyond both.
const CASE_TIMEOUT_MS = 15000
const CHILD_TIMEOUT_MS = 60000

export const WITNESS_TIMEOUT_MS = 120000

// The child's own report is the diagnosis. A bare status code would say a witness failed without saying which
// assertion or what it saw, so it is raised rather than compared away.
export const runNodeWitness = witnessUrl => {
    const witness = fileURLToPath(witnessUrl)
    const {status, signal, error, stdout, stderr} = spawnSync(
        process.execPath,
        [
            '--experimental-test-module-mocks',
            '--test-isolation=none',
            `--test-timeout=${CASE_TIMEOUT_MS}`,
            '--test',
            witness
        ],
        {encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL'}
    )
    if (status !== 0) {
        throw new Error(
            `${witness} failed - status ${status}, signal ${signal}${error ? `, ${error.message}` : ''}`
            + `\n\n${stdout}\n${stderr}`
        )
    }
}
