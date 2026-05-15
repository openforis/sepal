const {cleanTitle} = require('#mcp/chat/conversation/titleGenerator')

describe('cleanTitle', () => {

    it('strips wrapping quotes', () => {
        expect(cleanTitle('"NDVI change Kenya"')).toBe('NDVI change Kenya')
        expect(cleanTitle('\'NDVI change Kenya\'')).toBe('NDVI change Kenya')
    })

    it('strips trailing punctuation', () => {
        expect(cleanTitle('NDVI change Kenya.')).toBe('NDVI change Kenya')
        expect(cleanTitle('NDVI change Kenya?')).toBe('NDVI change Kenya')
    })

    it('strips preamble like "Title:" or "Topic:"', () => {
        expect(cleanTitle('Title: NDVI change Kenya')).toBe('NDVI change Kenya')
        expect(cleanTitle('Topic: NDVI change Kenya')).toBe('NDVI change Kenya')
    })

    it('strips list markers', () => {
        expect(cleanTitle('1. NDVI change Kenya')).toBe('NDVI change Kenya')
        expect(cleanTitle('- NDVI change Kenya')).toBe('NDVI change Kenya')
    })

    it('strips <think>...</think> tags', () => {
        expect(cleanTitle('<think>let me think</think>NDVI change Kenya')).toBe('NDVI change Kenya')
    })

    it('returns null on empty input', () => {
        expect(cleanTitle('')).toBeNull()
        expect(cleanTitle(null)).toBeNull()
    })

    it('keeps only the first line', () => {
        expect(cleanTitle('NDVI change Kenya\nmore stuff')).toBe('NDVI change Kenya')
    })

    it('truncates at 80 chars', () => {
        const longTitle = 'a'.repeat(100)
        expect(cleanTitle(longTitle).length).toBe(80)
    })
})
