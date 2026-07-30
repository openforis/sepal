import {categoricalValueColumnWidth} from './categoricalOption'

describe('categoricalValueColumnWidth', () => {
    it('keeps short values compact and grows with the longest value', () => {
        expect(categoricalValueColumnWidth(['0', '9'])).toBe('4ch')
        expect(categoricalValueColumnWidth(['1', '12345'])).toBe('7ch')
    })

    it('caps unusually long values so labels retain space', () => {
        expect(categoricalValueColumnWidth(['a'.repeat(30)])).toBe('14ch')
        expect(categoricalValueColumnWidth([])).toBe('4ch')
    })
})
