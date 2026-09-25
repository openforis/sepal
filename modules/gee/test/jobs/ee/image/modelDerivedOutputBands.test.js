import {runNodeWitness, WITNESS_TIMEOUT_MS} from '../../../support/nodeWitness.js'

it('builds the bands Regression and Unsupervised Classification declare', () => {
    runNodeWitness(new URL('./modelDerivedOutputBands.node.test.mjs', import.meta.url))
}, WITNESS_TIMEOUT_MS)
