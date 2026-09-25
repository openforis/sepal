import {runNodeWitness, WITNESS_TIMEOUT_MS} from '../../../support/nodeWitness.js'

it('describes an Asset recipe over a collection from its first contributing image', () => {
    runNodeWitness(new URL('./assetCollectionSchema.node.test.mjs', import.meta.url))
}, WITNESS_TIMEOUT_MS)
