import {runNodeWitness, WITNESS_TIMEOUT_MS} from '../../../support/nodeWitness.js'

it('builds Class Change, Index Change and Remapping from the bands and legend they are configured with', () => {
    runNodeWitness(new URL('./changeRecipeExecution.node.test.mjs', import.meta.url))
}, WITNESS_TIMEOUT_MS)
