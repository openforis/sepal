import {beforeEach, describe, expect, it, vi} from 'vitest'

// Copying is acknowledged where the user clicked, not by a global notification, so the helper reports the outcome
// to its caller instead of publishing it. Failure stays global - a clipboard write that is refused leaves nothing
// on screen to notice - and must resolve rather than reject, so no caller has to catch it.

const notifications = vi.hoisted(() => ({success: [], info: [], error: []}))

vi.mock('~/widget/notifications', () => ({
    Notifications: {
        success: notification => notifications.success.push(notification),
        info: notification => notifications.info.push(notification),
        error: notification => notifications.error.push(notification)
    }
}))

vi.mock('~/translate', () => ({msg: key => key}))

const {copyToClipboard} = await import('./clipboard')

const writeText = vi.fn()

beforeEach(() => {
    notifications.success = []
    notifications.info = []
    notifications.error = []
    writeText.mockReset()
    Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true})
})

describe('copying a value to the clipboard', () => {
    it('writes the value and reports success without publishing anything', async () => {
        writeText.mockResolvedValue(undefined)

        await expect(copyToClipboard('some-value')).resolves.toBe(true)

        expect(writeText).toHaveBeenCalledWith('some-value')
        expect(notifications.success).toEqual([])
        expect(notifications.info).toEqual([])
    })

    it('reports failure rather than rejecting, and publishes the global error', async () => {
        writeText.mockRejectedValue(new Error('denied'))

        await expect(copyToClipboard('some-value')).resolves.toBe(false)

        expect(notifications.error).toEqual([{message: 'clipboard.copy.failure', timeout: 3}])
    })

    it('lets a caller override the failure message', async () => {
        writeText.mockRejectedValue(new Error('denied'))

        await copyToClipboard('some-value', {failureMessage: 'custom failure'})

        expect(notifications.error).toEqual([{message: 'custom failure', timeout: 3}])
    })
})
