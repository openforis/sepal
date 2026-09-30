import {runNodeWitness, WITNESS_TIMEOUT_MS} from '../../../support/nodeWitness.js'

it('returns the bands asked of a BAYTS Historical', () => {
    runNodeWitness(new URL('./historicalOutputBands.node.test.mjs', import.meta.url))
}, WITNESS_TIMEOUT_MS)
