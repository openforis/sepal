import {describe, expect, it} from 'vitest'

import {newVariableName} from './variableName'

describe('the name of a new input', () => {
    it('is one past the highest an input has, the others kept', () => {
        expect(newVariableName('i', {images: [named('i2')]})).toBe('i3')
    })

    it('is not one a calculation still reads, its input removed', () => {
        expect(newVariableName('i', {images: [named('i2')], calculations: [reading('i5')]})).toBe('i6')
    })

    it.each([
        ['too large to add to exactly as a float', 'i9007199254740992', 'i9007199254740993'],
        ['too large to write plainly as a float', 'i1000000000000000000000', 'i1000000000000000000001']
    ])('is counted exactly past a number %s', (_case, highest, expected) => {
        expect(newVariableName('i', {images: [named(highest)]})).toBe(expected)
    })

    it('is the lowest number no input has, where one past the highest would be longer than a name may be', () => {
        expect(newVariableName('i', {images: [named('i1'), named('i99999999999999999999999999999')]})).toBe('i2')
    })
})

const named = name => ({name})

const reading = imageName => ({name: 'c1', usedBands: [{imageName, name: 'red'}]})
