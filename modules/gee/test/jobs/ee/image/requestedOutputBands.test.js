import {runNodeWitness, WITNESS_TIMEOUT_MS} from '../../../support/nodeWitness.js'

it('returns the output bands an image export names', () => {
    runNodeWitness(new URL('./requestedOutputBands.node.test.mjs', import.meta.url))
}, WITNESS_TIMEOUT_MS)
