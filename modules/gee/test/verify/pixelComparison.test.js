import {different, identical, pixelComparison} from '../../verify/pixelComparison.mjs'

// What a pixel-by-pixel comparison read from Earth Engine establishes. Earth Engine reads a band without pixels
// valid in both images as a null maximum difference, and a band it did not compare as no entry at all.

describe('a comparison with a number for every band', () => {
    it('is identical, not different, when no mask or value differs', () => {
        const comparison = pixelComparison(differences())

        expect(identical(comparison)).toBe(true)
        expect(different(comparison)).toBe(false)
    })

    it('is different, not identical, when a mask differs', () => {
        const comparison = pixelComparison(differences({maskDifferences: {flag: 3}}))

        expect(different(comparison)).toBe(true)
        expect(identical(comparison)).toBe(false)
    })

    it('is different, not identical, when a value differs where both are valid', () => {
        const comparison = pixelComparison(differences({maxAbsoluteDifference: {flag: 0.5}}))

        expect(different(comparison)).toBe(true)
        expect(identical(comparison)).toBe(false)
    })
})

describe('a comparison without a usable number for a band', () => {
    // Each case spoils `flag` in a comparison that would otherwise be identical, and in one that would otherwise be
    // different through `non_forest_probability`.
    it.each([
        ['no mask difference entry', {maskDifferences: {flag: undefined}}],
        ['a null mask difference', {maskDifferences: {flag: null}}],
        ['a nonfinite mask difference', {maskDifferences: {flag: Infinity}}],
        ['no maximum difference entry', {maxAbsoluteDifference: {flag: undefined}}],
        ['a null maximum difference', {maxAbsoluteDifference: {flag: null}}],
        ['a nonfinite maximum difference', {maxAbsoluteDifference: {flag: NaN}}],
        ['a maximum difference that is no number', {maxAbsoluteDifference: {flag: '0'}}],
        ['no jointly valid count', {jointlyValid: {flag: undefined}}],
        ['a null jointly valid count', {jointlyValid: {flag: null}}],
        ['no pixel valid in both', {jointlyValid: {flag: 0}}]
    ])('is neither identical nor different, with %s', (_label, spoiled) => {
        expect(identical(pixelComparison(differences(spoiled)))).toBe(false)
        expect(different(pixelComparison(differences(DIFFERING, spoiled)))).toBe(false)
    })
})

describe('a comparison of images with other bands', () => {
    it.each([
        ['no bands', {bands: [], referenceBands: []}],
        ['bands the reference lacks', {referenceBands: ['non_forest_probability']}],
        ['the same bands in another order', {referenceBands: ['flag', 'non_forest_probability']}]
    ])('is neither identical nor different, with %s', (_label, bands) => {
        expect(identical(pixelComparison({...differences(), ...bands}))).toBe(false)
        expect(different(pixelComparison({...differences(DIFFERING), ...bands}))).toBe(false)
    })
})

const DIFFERING = {maxAbsoluteDifference: {non_forest_probability: 0.25}}

// An identical comparison of two bands, with the entries given merged in. An entry given as undefined is removed.
const differences = (...overrides) => {
    const merged = [
        {
            bands: ['non_forest_probability', 'flag'],
            referenceBands: ['non_forest_probability', 'flag'],
            maskDifferences: {non_forest_probability: 0, flag: 0},
            maxAbsoluteDifference: {non_forest_probability: 0, flag: 0},
            jointlyValid: {non_forest_probability: 484, flag: 484}
        },
        ...overrides
    ].reduce((result, override) => ({
        ...result,
        ...Object.fromEntries(Object.entries(override).map(([key, value]) =>
            [key, Array.isArray(value) ? value : {...result[key], ...value}]))
    }))
    return Object.fromEntries(Object.entries(merged).map(([key, value]) => [key, Array.isArray(value)
        ? value
        : Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))]))
}
