import {describe, expect, it} from 'vitest'

import {applyJsonPatch, JsonPatchApplyError, JsonPatchInvalidError} from './jsonPatch'

describe('applyJsonPatch', () => {

    describe('envelope validation (throws JsonPatchInvalidError before any apply)', () => {

        it('rejects an empty operations array', () => {
            expect(() => applyJsonPatch({}, [])).toThrow(JsonPatchInvalidError)
        })

        it('rejects a non-array operations argument', () => {
            expect(() => applyJsonPatch({}, null)).toThrow(JsonPatchInvalidError)
        })

        it('rejects an unknown op', () => {
            expect(() => applyJsonPatch({}, [{op: 'frobnicate', path: '/x', value: 1}]))
                .toThrow(JsonPatchInvalidError)
        })

        it('rejects a non-string path', () => {
            expect(() => applyJsonPatch({}, [{op: 'add', path: 42, value: 1}]))
                .toThrow(JsonPatchInvalidError)
        })

        it('rejects a path that does not start with /', () => {
            expect(() => applyJsonPatch({a: 1}, [{op: 'replace', path: 'a', value: 2}]))
                .toThrow(JsonPatchInvalidError)
        })

        it('rejects an add op missing a value field', () => {
            expect(() => applyJsonPatch({}, [{op: 'add', path: '/x'}]))
                .toThrow(JsonPatchInvalidError)
        })

        it('rejects a move op missing the from field', () => {
            expect(() => applyJsonPatch({a: 1}, [{op: 'move', path: '/b'}]))
                .toThrow(JsonPatchInvalidError)
        })
    })

    describe('atomicity', () => {

        it('does not mutate the input document', () => {
            const document = {a: 1, b: 2}

            applyJsonPatch(document, [{op: 'replace', path: '/a', value: 99}])

            expect(document).toEqual({a: 1, b: 2})
        })

        it('does not partially apply when a later op fails', () => {
            const document = {a: 1}

            expect(() => applyJsonPatch(document, [
                {op: 'replace', path: '/a', value: 2},
                {op: 'remove', path: '/missing'}
            ])).toThrow(JsonPatchApplyError)

            expect(document).toEqual({a: 1})
        })
    })

    describe('op: add', () => {

        it('adds a new property to an object', () => {
            const result = applyJsonPatch({a: 1}, [{op: 'add', path: '/b', value: 2}])

            expect(result).toEqual({a: 1, b: 2})
        })

        it('replaces an existing object property (per RFC 6902 §4.1)', () => {
            const result = applyJsonPatch({a: 1}, [{op: 'add', path: '/a', value: 99}])

            expect(result).toEqual({a: 99})
        })

        it('inserts into an array at a numeric index', () => {
            const result = applyJsonPatch({items: ['x', 'z']}, [{op: 'add', path: '/items/1', value: 'y'}])

            expect(result).toEqual({items: ['x', 'y', 'z']})
        })

        it('appends to an array when the last segment is "-"', () => {
            const result = applyJsonPatch({items: ['x']}, [{op: 'add', path: '/items/-', value: 'y'}])

            expect(result).toEqual({items: ['x', 'y']})
        })

        it('replaces the whole document when path is ""', () => {
            const result = applyJsonPatch({a: 1}, [{op: 'add', path: '', value: {b: 2}}])

            expect(result).toEqual({b: 2})
        })

        it('throws when the parent does not exist', () => {
            expect(() => applyJsonPatch({}, [{op: 'add', path: '/a/b', value: 1}]))
                .toThrow(JsonPatchApplyError)
        })
    })

    describe('op: remove', () => {

        it('removes an object property', () => {
            const result = applyJsonPatch({a: 1, b: 2}, [{op: 'remove', path: '/a'}])

            expect(result).toEqual({b: 2})
        })

        it('removes an array element by index', () => {
            const result = applyJsonPatch({items: ['x', 'y', 'z']}, [{op: 'remove', path: '/items/1'}])

            expect(result).toEqual({items: ['x', 'z']})
        })

        it('throws when the target does not exist', () => {
            expect(() => applyJsonPatch({a: 1}, [{op: 'remove', path: '/missing'}]))
                .toThrow(JsonPatchApplyError)
        })

        it('throws when the array index equals the array length (target must exist per RFC 6902 §4.2)', () => {
            expect(() => applyJsonPatch({items: ['x', 'y', 'z']}, [{op: 'remove', path: '/items/3'}]))
                .toThrow(JsonPatchApplyError)
        })
    })

    describe('op: replace', () => {

        it('replaces an existing object property', () => {
            const result = applyJsonPatch({a: 1}, [{op: 'replace', path: '/a', value: 2}])

            expect(result).toEqual({a: 2})
        })

        it('throws when the target does not exist', () => {
            expect(() => applyJsonPatch({a: 1}, [{op: 'replace', path: '/b', value: 2}]))
                .toThrow(JsonPatchApplyError)
        })

        it('throws when the array index equals the array length instead of silently extending the array', () => {
            expect(() => applyJsonPatch({items: ['x', 'y', 'z']}, [{op: 'replace', path: '/items/3', value: 'w'}]))
                .toThrow(JsonPatchApplyError)
        })
    })

    describe('op: move', () => {

        it('moves a value from one path to another', () => {
            const result = applyJsonPatch({a: 1, b: 2}, [{op: 'move', from: '/a', path: '/c'}])

            expect(result).toEqual({b: 2, c: 1})
        })

        it('throws when the source path does not exist', () => {
            expect(() => applyJsonPatch({a: 1}, [{op: 'move', from: '/missing', path: '/b'}]))
                .toThrow(JsonPatchApplyError)
        })

        it('throws when the from array index equals the array length (source must exist)', () => {
            expect(() => applyJsonPatch({items: ['x', 'y', 'z']}, [{op: 'move', from: '/items/3', path: '/grabbed'}]))
                .toThrow(JsonPatchApplyError)
        })
    })

    describe('op: copy', () => {

        it('copies a value from one path to another (source remains)', () => {
            const result = applyJsonPatch({a: 1}, [{op: 'copy', from: '/a', path: '/b'}])

            expect(result).toEqual({a: 1, b: 1})
        })

        it('deep-copies (mutating the copy does not affect the source)', () => {
            const result = applyJsonPatch({a: {nested: 1}}, [{op: 'copy', from: '/a', path: '/b'}])
            result.b.nested = 99

            expect(result.a.nested).toBe(1)
        })

        it('throws when the source path does not exist', () => {
            expect(() => applyJsonPatch({a: 1}, [{op: 'copy', from: '/missing', path: '/b'}]))
                .toThrow(JsonPatchApplyError)
        })

        it('throws when the from array index equals the array length instead of copying undefined', () => {
            expect(() => applyJsonPatch({items: ['x', 'y', 'z']}, [{op: 'copy', from: '/items/3', path: '/grabbed'}]))
                .toThrow(JsonPatchApplyError)
        })
    })

    describe('op: test', () => {

        it('passes through unchanged when the value at path deep-equals', () => {
            const result = applyJsonPatch({a: {b: 1}}, [{op: 'test', path: '/a', value: {b: 1}}])

            expect(result).toEqual({a: {b: 1}})
        })

        it('throws when the value differs', () => {
            expect(() => applyJsonPatch({a: 1}, [{op: 'test', path: '/a', value: 2}]))
                .toThrow(JsonPatchApplyError)
        })

        it('throws when the path does not exist', () => {
            expect(() => applyJsonPatch({a: 1}, [{op: 'test', path: '/b', value: 1}]))
                .toThrow(JsonPatchApplyError)
        })
    })

    describe('escape sequences (RFC 6901)', () => {

        it('decodes ~1 as "/" in path segments', () => {
            const result = applyJsonPatch({'a/b': 1}, [{op: 'replace', path: '/a~1b', value: 2}])

            expect(result).toEqual({'a/b': 2})
        })

        it('decodes ~0 as "~" in path segments', () => {
            const result = applyJsonPatch({'a~b': 1}, [{op: 'replace', path: '/a~0b', value: 2}])

            expect(result).toEqual({'a~b': 2})
        })
    })
})
