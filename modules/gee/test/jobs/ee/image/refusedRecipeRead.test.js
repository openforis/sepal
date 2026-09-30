import {runNodeWitness, WITNESS_TIMEOUT_MS} from '../../../support/nodeWitness.js'

it('stops execution on a refused recipe read', () => {
    runNodeWitness(new URL('./refusedRecipeRead.node.test.mjs', import.meta.url))
}, WITNESS_TIMEOUT_MS)
