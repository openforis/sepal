import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))

const {deriveCalculations} = await import('./deriveCalculations')

describe('the bands calculations yield, derived again', () => {
    it('follow a chain in order, each from the calculation before it as just derived', () => {
        const calculations = [
            expression('calc-1', 'a', 'i1.red', [NIR_OF_I1]),
            expression('calc-2', 'b', 'a', [NIR_OF_I1]),
            expression('calc-3', 'c', 'b * 2', [NIR_OF_I1])
        ]

        const derived = deriveCalculations({images: [INPUT], calculations})

        expect(derived.map(bandsOf)).toEqual([['red-id:red'], ['red-id:red'], ['red-id:red']])
    })

    it.each([
        ['reads a band no longer selected', 'i1.swir'],
        ['cannot be read', '(i1.red'],
        ['gives a function too few arguments', 'max(i1.red)'],
        ['reads images whole with different band counts', 'i1 + i2']
    ])('are kept by a calculation that %s, and by the calculations reading it', (_case, text) => {
        const calculations = [expression('calc-1', 'a', text, [NIR_OF_I1]), expression('calc-2', 'b', 'a', [NIR_OF_I1])]

        const derived = deriveCalculations({images: [INPUT, I2], calculations})

        expect(derived).toEqual(calculations)
        expect(derived[0]).toBe(calculations[0])
        expect(derived[1]).toBe(calculations[1])
    })

    it('are kept by a calculation reading an unmet function, while a met function is passed through as it is', () => {
        const unmetFunction = func('calc-1', 'f', [{imageId: 'img-1', imageName: 'i1', name: 'swir'}])
        const metFunction = func('calc-2', 'g', [{imageId: 'img-1', imageName: 'i1', name: 'red'}])
        const calculations = [unmetFunction, metFunction, expression('calc-3', 'c', 'f + g', [NIR_OF_I1])]

        const derived = deriveCalculations({images: [INPUT], calculations})

        expect(derived).toEqual(calculations)
        expect(derived[1]).toBe(metFunction)
    })

    it('leave a calculation whose bands are unchanged as it was', () => {
        const calculations = [expression('calc-1', 'a', 'i1.red', [{...RED, imageId: 'img-1', imageName: 'i1'}])]

        expect(deriveCalculations({images: [INPUT], calculations})[0]).toBe(calculations[0])
    })
})

const RED = {id: 'red-id', name: 'red'}
const NIR = {id: 'nir-id', name: 'nir'}
const INPUT = {imageId: 'img-1', name: 'i1', includedBands: [RED, NIR]}
const I2 = {imageId: 'img-2', name: 'i2', includedBands: [{id: 'a-id', name: 'a'}, {id: 'b-id', name: 'b'}, {id: 'c-id', name: 'c'}]}
const NIR_OF_I1 = {...NIR, imageId: 'img-1', imageName: 'i1'}

function expression(imageId, name, text, includedBands) {
    return {imageId, name, type: 'EXPRESSION', expression: text, bandRenameStrategy: 'SUFFIX', usedBands: [], includedBands}
}

function func(imageId, name, usedBands) {
    return {imageId, name, type: 'FUNCTION', reducer: 'max', usedBands, includedBands: [{id: `${imageId}-band`, name: 'max'}]}
}

function bandsOf({includedBands}) {
    return includedBands.map(({id, name}) => `${id}:${name}`)
}
