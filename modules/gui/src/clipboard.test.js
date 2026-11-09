import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Copying is acknowledged where the user clicked, not by a global notification, so the helper reports the outcome
// to its caller instead of publishing it. Failure stays global - a clipboard write that is refused leaves nothing
// on screen to notice - and must resolve rather than reject, so no caller has to catch it. What is published is
// observed where every notification passes, whichever view shows it.

vi.mock('~/translate', () => ({msg: key => key, getLanguage: () => 'en'}))

const {copyToClipboard} = await import('./clipboard')
const {published$} = await import('./widget/notificationPublisher')
const {Notifications} = await import('./widget/notifications')

const writeText = vi.fn()

let published, subscription

beforeEach(() => {
    vi.stubGlobal('gtag', () => {})
    writeText.mockReset()
    Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true})
    published = []
    subscription = published$.subscribe(notification => published.push(notification))
})

afterEach(() => {
    subscription.unsubscribe()
    vi.unstubAllGlobals()
})

describe('copying a value to the clipboard', () => {
    it('writes the value and reports success without publishing anything', async () => {
        writeText.mockResolvedValue(undefined)

        await expect(copyToClipboard('some-value')).resolves.toBe(true)

        expect(writeText).toHaveBeenCalledWith('some-value')
        expect(published).toEqual([])
    })

    it('reports failure rather than rejecting, and publishes the global error', async () => {
        writeText.mockRejectedValue(new Error('denied'))

        await expect(copyToClipboard('some-value')).resolves.toBe(false)

        expect(published).toEqual([expect.objectContaining({level: 'error', message: 'clipboard.copy.failure', timeout: 3})])
    })

    it('lets a caller override the failure message', async () => {
        writeText.mockRejectedValue(new Error('denied'))

        await copyToClipboard('some-value', {failureMessage: 'custom failure'})

        expect(published).toEqual([expect.objectContaining({level: 'error', message: 'custom failure', timeout: 3})])
    })

    it('publishes a failure on the stream the Notifications API publishes on', async () => {
        writeText.mockRejectedValue(new Error('denied'))

        await copyToClipboard('some-value')
        Notifications.error({message: 'published elsewhere'})

        expect(published.map(({message}) => message)).toEqual(['clipboard.copy.failure', 'published elsewhere'])
    })
})
