import {runNodeWitness, WITNESS_TIMEOUT_MS} from '../../../support/nodeWitness.js'

it('numbers Class Change transitions in legend order', () => {
    runNodeWitness(new URL('./classChangeNumbering.node.test.mjs', import.meta.url))
}, WITNESS_TIMEOUT_MS)
