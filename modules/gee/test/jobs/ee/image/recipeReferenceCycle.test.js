import {runNodeWitness, WITNESS_TIMEOUT_MS} from '../../../support/nodeWitness.js'

it('rejects recursive recipe references', () => {
    runNodeWitness(new URL('./recipeReferenceCycle.node.test.mjs', import.meta.url))
}, WITNESS_TIMEOUT_MS)
