import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {firstValueFrom} from 'rxjs'

// What a Stack's catalogue answers: the output names its mapping gives, in model order, however it was asked and
// without building anything. Which bands execution builds is the live verifier's (verify/stackOutputBands.mjs).

mock.module('#sepal/ee/ee', {
    exports: {
        default: {}
    }
})
const imageFactory = mock.fn()
mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: imageFactory
    }
})

const {default: stack} = await import('#sepal/ee/stack/stack')

describe('the bands a Stack reports', () => {
    for (const [scenario, args] of [
        ['nothing', undefined],
        ['an empty selection', {selection: []}],
        ['some of its bands', {selection: ['water']}]
    ]) {
        it(
            `are its mapped output names in model order, whatever it is asked for: ${scenario}`,
            async () => {
                assert.deepEqual(
                    await firstValueFrom(stack(STACK, args).getBands$()),
                    ['dem', 'water', 'extent']
                )
                assert.equal(imageFactory.mock.callCount(), 0)
            }
        )
    }
})

it('names the input that maps no bands when built', () => {
    const unmapped = {model: {...STACK.model, bandNames: {bandNames: [STACK.model.bandNames.bandNames[0]]}}}

    assert.throws(() => stack(unmapped).getImage$(), /Stack input i-1 maps no bands/)
})

// The mapping lists the second image first; the output follows the images.
const STACK = {
    model: {
        inputImagery: {images: [
            {imageId: 'i-1', type: 'ASSET', id: 'users/x/dem'},
            {imageId: 'i-2', type: 'ASSET', id: 'users/x/water'}
        ]},
        bandNames: {bandNames: [
            {imageId: 'i-2', bands: [{id: 'b2', originalName: 'occurrence', outputName: 'water'}, {id: 'b3', originalName: 'max_extent', outputName: 'extent'}]},
            {imageId: 'i-1', bands: [{id: 'b1', originalName: 'elevation', outputName: 'dem'}]}
        ]}
    }
}
