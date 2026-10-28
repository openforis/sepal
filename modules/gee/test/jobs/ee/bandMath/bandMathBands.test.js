import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {firstValueFrom} from 'rxjs'

// What a Band Math recipe's catalogue answers: its configured output names, in configured order, however it was
// asked and without building anything. Which bands execution builds is the live verifier's
// (verify/bandMathOutputBands.mjs).

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

const {default: bandMath} = await import('#sepal/ee/bandMath/bandMath')

describe('the bands a Band Math recipe reports', () => {
    for (const [scenario, args] of [
        ['nothing', undefined],
        ['an empty selection', {selection: []}],
        ['some of its bands', {selection: ['mean']}]
    ]) {
        it(
            `are its configured output names, whatever it is asked for: ${scenario}`,
            async () => {
                assert.deepEqual(
                    await firstValueFrom(bandMath(BAND_MATH, args).getBands$()),
                    ['dem2', 'elevation', 'mean']
                )
                assert.equal(imageFactory.mock.callCount(), 0)
            }
        )
    }
})

const BAND_MATH = {
    model: {
        inputImagery: {images: [{imageId: 'i-1', name: 'i1', type: 'ASSET', id: 'users/x/dem', includedBands: [{name: 'elevation'}]}]},
        calculations: {calculations: []},
        outputBands: {outputImages: [
            {imageId: 'c-1', outputBands: [{name: 'doubled', defaultOutputName: 'doubled', outputName: 'dem2'}]},
            {imageId: 'i-1', outputBands: [{name: 'elevation', defaultOutputName: 'elevation'}]},
            {imageId: 'c-2', outputBands: [{name: 'mean', defaultOutputName: 'mean'}]}
        ]}
    }
}
