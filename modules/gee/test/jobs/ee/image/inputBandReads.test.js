import {runNodeWitness, WITNESS_TIMEOUT_MS} from '../../../support/nodeWitness.js'

it('gives Band Math and Stack the bands they name from a CCDC input', () => {
    runNodeWitness(new URL('./inputBandReads.node.test.mjs', import.meta.url))
}, WITNESS_TIMEOUT_MS)
