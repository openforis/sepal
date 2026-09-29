import {jest} from '@jest/globals'
import {firstValueFrom} from 'rxjs'

// What a Band Math recipe's catalogue answers: its configured output names, in configured order, however it was
// asked and without building anything. Which bands execution builds is the live verifier's
// (verify/bandMathOutputBands.mjs).

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: {}}))
const imageFactory = jest.fn()
jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({default: imageFactory}))

const {default: bandMath} = await import('#sepal/ee/bandMath/bandMath')

describe('the bands a Band Math recipe reports', () => {
    it.each([
        ['nothing', undefined],
        ['an empty selection', {selection: []}],
        ['some of its bands', {selection: ['mean']}]
    ])('are its configured output names, whatever it is asked for: %s', async (_case, args) => {
        expect(await firstValueFrom(bandMath(BAND_MATH, args).getBands$())).toEqual(['dem2', 'elevation', 'mean'])
        expect(imageFactory).not.toHaveBeenCalled()
    })
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
