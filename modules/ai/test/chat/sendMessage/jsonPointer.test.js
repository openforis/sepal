const {parsePointer, resolvePointer, formatPointer} = require('#mcp/chat/sendMessage/jsonPointer')

describe('JSON Pointer (RFC 6901)', () => {

    describe('parsePointer', () => {

        it('parses the empty pointer as the whole-document token list', () => {
            expect(parsePointer('')).toEqual([])
        })

        it('parses a slash-separated pointer into tokens', () => {
            expect(parsePointer('/trainingData/dataSets/0/referenceData'))
                .toEqual(['trainingData', 'dataSets', '0', 'referenceData'])
        })

        it('unescapes ~1 to / and ~0 to ~ within a token', () => {
            expect(parsePointer('/a~1b/c~0d')).toEqual(['a/b', 'c~d'])
        })

        it('rejects a non-empty pointer that does not start with a slash', () => {
            expect(() => parsePointer('trainingData/dataSets')).toThrow(/Invalid JSON Pointer/)
        })
    })

    describe('resolvePointer', () => {
        const doc = {trainingData: {dataSets: [{referenceData: [{class: 'forest'}]}]}}

        it('returns the whole document for the empty token list', () => {
            expect(resolvePointer(doc, [])).toBe(doc)
        })

        it('walks object keys and array indices to the targeted value', () => {
            expect(resolvePointer(doc, ['trainingData', 'dataSets', '0', 'referenceData', '0']))
                .toEqual({class: 'forest'})
        })

        it('throws when an object key is missing', () => {
            expect(() => resolvePointer(doc, ['trainingData', 'missing'])).toThrow(/not found/)
        })

        it('throws when an array index is out of range', () => {
            expect(() => resolvePointer(doc, ['trainingData', 'dataSets', '5'])).toThrow(/not found/)
        })

        it('throws when an array token is not a numeric index', () => {
            expect(() => resolvePointer(doc, ['trainingData', 'dataSets', 'oops'])).toThrow(/not found/)
        })

        it('throws when descending into a non-object', () => {
            expect(() => resolvePointer(doc, ['trainingData', 'dataSets', '0', 'referenceData', '0', 'class', 'x']))
                .toThrow(/not found/)
        })
    })

    describe('formatPointer', () => {

        it('formats the empty token list as the empty pointer', () => {
            expect(formatPointer([])).toBe('')
        })

        it('formats tokens as a slash-separated pointer', () => {
            expect(formatPointer(['trainingData', 'dataSets', '0'])).toBe('/trainingData/dataSets/0')
        })

        it('escapes ~ to ~0 and / to ~1 within a token', () => {
            expect(formatPointer(['a/b', 'c~d'])).toBe('/a~1b/c~0d')
        })
    })
})
