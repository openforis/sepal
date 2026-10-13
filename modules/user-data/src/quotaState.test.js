import {QuotaState} from './quotaState.js'

describe('mode', () => {
    it('is read-write for a user with no verdict', () => {
        expect(new QuotaState().mode('alice')).toBe('readWrite')
    })

    it('is read-only while the user is over the Data quota', () => {
        const state = new QuotaState()

        state.onExceeded({username: 'alice', reason: 'DATA_QUOTA'})

        expect(state.mode('alice')).toBe('read')
    })

    it('stays read-write when the user is over another budget', () => {
        const state = new QuotaState()

        state.onExceeded({username: 'alice', reason: 'INSTANCE_BUDGET'})

        expect(state.mode('alice')).toBe('readWrite')
    })

    it('is read-write again once the verdict clears', () => {
        const state = new QuotaState()
        state.onExceeded({username: 'alice', reason: 'DATA_QUOTA'})

        state.onCleared({username: 'alice'})

        expect(state.mode('alice')).toBe('readWrite')
    })

    it('follows a later verdict with another reason', () => {
        const state = new QuotaState()
        state.onExceeded({username: 'alice', reason: 'DATA_QUOTA'})

        state.onExceeded({username: 'alice', reason: 'INSTANCE_BUDGET'})

        expect(state.mode('alice')).toBe('readWrite')
    })

    it('matches usernames case-insensitively', () => {
        const state = new QuotaState()

        state.onExceeded({username: 'Alice', reason: 'DATA_QUOTA'})

        expect(state.mode('alice')).toBe('read')
    })
})
