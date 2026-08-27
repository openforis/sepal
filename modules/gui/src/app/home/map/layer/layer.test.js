import {throwError} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {notifyError, toUserErrorMessage, warn} = vi.hoisted(() => ({
    notifyError: vi.fn(),
    toUserErrorMessage: vi.fn(() => '<safe detail>'),
    warn: vi.fn()
}))

vi.mock('~/log', () => ({
    getLogger: () => ({debug: vi.fn(), warn})
}))
vi.mock('~/translate', () => ({msg: key => `<${key}>`}))
vi.mock('~/userError', () => ({toUserErrorMessage}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: notifyError}}))

const {Layer} = await import('./layer')

class FailingLayer extends Layer {
    constructor(error) {
        super()
        this.failure = error
    }

    addToMap$ = () => throwError(() => this.failure)
    removeFromMap = () => undefined
}

// What the whole classification matrix produces is userError's contract; this only pins that a failing
// layer hands the error to that helper and reports whatever it returns.
describe('Layer.add error reporting', () => {
    const failure = {status: 502, message: 'ajax error 502'}

    beforeEach(() => {
        vi.clearAllMocks()
        toUserErrorMessage.mockReturnValue('<safe detail>')
        new FailingLayer(failure).add()
    })

    it('reports the safe detail under the layer message', () => {
        expect(notifyError).toHaveBeenCalledTimes(1)
        expect(notifyError).toHaveBeenCalledWith({
            message: '<map.layer.error>',
            error: '<safe detail>',
            group: true,
            timeout: 0
        })
    })

    it('classifies the error it failed with', () => {
        expect(toUserErrorMessage).toHaveBeenCalledTimes(1)
        expect(toUserErrorMessage).toHaveBeenCalledWith(failure)
    })

    // The log keeps the original for diagnosis; only the notification is sanitised.
    it('logs the original error unchanged', () => {
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn).toHaveBeenCalledWith('Cannot add layer', failure)
    })
})
