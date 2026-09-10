import {spawnSync} from 'child_process'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

// imageFactory's lazy require(esm) needs Node's runtime rather than Jest's CJS resolver.
const WITNESS = join(dirname(fileURLToPath(import.meta.url)), 'ccdcBands.runtime.mjs')

it('discovers CCDC and Slice bands through the real source adapters', () => {
    const {status, stdout, stderr} = spawnSync(
        process.execPath,
        ['--experimental-test-module-mocks', '--test', WITNESS],
        {encoding: 'utf8'}
    )
    if (status !== 0) {
        throw new Error(`${WITNESS} failed\n\n${stdout}\n${stderr}`)
    }
    expect(status).toBe(0)
}, 120000)
