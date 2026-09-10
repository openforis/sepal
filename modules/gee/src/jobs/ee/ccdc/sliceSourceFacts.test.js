import {spawnSync} from 'child_process'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

// A bridge, not a test of its own. The behavioral witness lives in the sibling .mjs and runs under Node's own
// test runner, because imageFactory loads its implementations through createRequire: real Node supports
// require(esm), Jest's CJS resolver answers ERR_REQUIRE_ESM and the factory throws before a slice can resolve
// its source. Launching it from here keeps the witness inside the ordinary `sepal npm-test gee` gate.
const WITNESS = join(dirname(fileURLToPath(import.meta.url)), 'sliceSourceFacts.runtime.mjs')

it('resolves the segment facts of the source it slices', () => {
    const {status, stdout, stderr} = spawnSync(
        process.execPath,
        ['--experimental-test-module-mocks', '--test', WITNESS],
        {encoding: 'utf8'}
    )
    // The child's own report is the diagnosis. A bare status code would say a witness failed without saying
    // which assertion or what it saw, so it is raised rather than compared away.
    if (status !== 0) {
        throw new Error(`${WITNESS} failed\n\n${stdout}\n${stderr}`)
    }
    expect(status).toBe(0)
}, 120000)
