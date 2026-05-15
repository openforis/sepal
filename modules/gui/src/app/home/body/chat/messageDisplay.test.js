import {vi} from 'vitest'

import {displayedContent} from './messageDisplay'

describe('displayedContent', () => {

    it('returns the message content when there is no display descriptor', () => {
        const translate = vi.fn()

        expect(displayedContent({content: 'Hello'}, translate)).toBe('Hello')
        expect(translate).not.toHaveBeenCalled()
    })

    it('asks the translator for the descriptor key, args, and fallback when a descriptor is present', () => {
        const translate = vi.fn(() => 'localized')
        const message = {
            content: 'Step cap reached.',
            display: {key: 'home.chat.notices.toolRoundCap', args: {max: 8}, fallback: 'Step cap reached.'}
        }

        const result = displayedContent(message, translate)

        expect(result).toBe('localized')
        expect(translate).toHaveBeenCalledWith('home.chat.notices.toolRoundCap', {max: 8}, 'Step cap reached.')
    })

    it('falls back to the message content when the descriptor carries no fallback', () => {
        const translate = vi.fn((_key, _args, fallback) => fallback)
        const message = {
            content: 'plain text',
            display: {key: 'missing.key'}
        }

        expect(displayedContent(message, translate)).toBe('plain text')
        expect(translate).toHaveBeenCalledWith('missing.key', {}, 'plain text')
    })
})
