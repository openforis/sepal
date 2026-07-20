import {isSkipped, isStratificationSkipped} from './stratificationSkip.js'

// The skip flag exists as a boolean model field and as the old form-toggle array shape. Both must be read the
// same way everywhere: a disagreement silently routes a design down the wrong sampling path - a stratified
// recipe skipping stratified-only validation, or an unstratified export failing a rule that never applied.
describe('isSkipped', () => {
    it('treats boolean true and a non-empty legacy array as skipped', () => {
        expect(isSkipped(true)).toBe(true)
        expect(isSkipped([true])).toBe(true)
    })

    it('treats false, an empty legacy array and an absent value as not skipped', () => {
        expect(isSkipped(false)).toBe(false)
        expect(isSkipped([])).toBe(false)
        expect(isSkipped(undefined)).toBe(false)
        expect(isSkipped(null)).toBe(false)
    })
})

describe('isStratificationSkipped', () => {
    it('reads the skip flag off the stratification, in both representations', () => {
        expect(isStratificationSkipped({skip: true})).toBe(true)
        expect(isStratificationSkipped({skip: [true]})).toBe(true)
        expect(isStratificationSkipped({skip: false})).toBe(false)
        expect(isStratificationSkipped({skip: []})).toBe(false)
        expect(isStratificationSkipped({skip: undefined})).toBe(false)
    })

    it('is false for an absent stratification', () => {
        expect(isStratificationSkipped(undefined)).toBe(false)
        expect(isStratificationSkipped({})).toBe(false)
    })
})
