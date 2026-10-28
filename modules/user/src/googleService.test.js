import assert from 'node:assert/strict'
import {beforeEach, describe, test} from 'node:test'

import {InvalidTokenError} from './googleOAuth.js'
import {GoogleService} from './googleService.js'

// Google credentials as the rest of the module sees them: what is stored, what is published, and when a
// token is old enough to be worth refreshing. The repository fake keeps its rows, so "persisted, then
// reloaded, then published" is observable rather than asserted against a call log.

describe('GoogleService', () => {
    let repository
    let credentialsFile
    let published
    let now

    beforeEach(() => {
        repository = aRepository()
        credentialsFile = {}
        published = []
        now = NOW
    })

    describe('refreshGoogleTokens', () => {
        test('reports no tokens for a user who has never connected an account', async () => {
            const refreshed = await service().refreshGoogleTokens(USERNAME, null)

            const stored = await storedTokens()
            assert.equal(refreshed, null)
            assert.equal(stored, null)
        })

        test('leaves a token with plenty of life left alone', async () => {
            const tokens = tokensExpiringIn(11 * MINUTE)

            const result = await service({googleOAuth: refusingToRefresh()}).refreshGoogleTokens(USERNAME, tokens)

            assert.equal(result, tokens)
        })

        test('refreshes a token that is about to expire', async () => {
            const result = await service().refreshGoogleTokens(USERNAME, tokensExpiringIn(9 * MINUTE))

            const stored = await storedTokens()
            assert.deepEqual(result, REFRESHED_TOKENS)
            assert.deepEqual(stored, REFRESHED_TOKENS)
            assert.deepEqual(credentialsFile[USERNAME], REFRESHED_TOKENS)
            assert.equal(published.length, 1)
            assert.partialDeepStrictEqual(published, [{googleTokens: REFRESHED_TOKENS}])
        })

        // Ten minutes is the boundary, and it counts as due.
        test('refreshes a token expiring exactly ten minutes from now', async () => {
            const result = await service().refreshGoogleTokens(USERNAME, tokensExpiringIn(10 * MINUTE))

            assert.deepEqual(result, REFRESHED_TOKENS)
        })

        test('takes the user\'s stored tokens when the caller passes none', async () => {
            await repository.updateGoogleTokens(USERNAME, tokensExpiringIn(MINUTE))

            const result = await service().refreshGoogleTokens(USERNAME)

            assert.deepEqual(result, REFRESHED_TOKENS)
        })

        // Google has told us the refresh token is no good; keeping it would fail on every attempt.
        test('clears the stored credentials when Google rejects the refresh token', async () => {
            await repository.updateGoogleTokens(USERNAME, tokensExpiringIn(MINUTE))
            const rejecting = failingToRefresh(new InvalidTokenError('invalid_grant'))

            const result = await service({googleOAuth: rejecting}).refreshGoogleTokens(USERNAME)

            const stored = await storedTokens()
            assert.equal(result, null)
            assert.equal(stored, null)
            assert.equal(credentialsFile[USERNAME], null)
            assert.equal(published.length, 1)
            assert.partialDeepStrictEqual(published, [{googleTokens: null}])
        })

        // Anything else is an outage, not a verdict on the token: the caller must see it.
        test('reports any other refresh failure, keeping the stored credentials', async () => {
            const stored = tokensExpiringIn(MINUTE)
            await repository.updateGoogleTokens(USERNAME, stored)
            const failing = failingToRefresh(new Error('google is down'))

            await assert.rejects(
                service({googleOAuth: failing}).refreshGoogleTokens(USERNAME),
                /google is down/
            )

            const kept = await storedTokens()
            assert.deepEqual(kept, stored)
            assert.deepEqual(published, [])
        })
    })

    describe('saveTokens', () => {
        test('stores the tokens, then publishes the user carrying them', async () => {
            const user = await service().saveTokens(USERNAME, REFRESHED_TOKENS)

            const stored = await storedTokens()
            assert.deepEqual(stored, REFRESHED_TOKENS)
            assert.deepEqual(credentialsFile[USERNAME], REFRESHED_TOKENS)
            assert.deepEqual(user.googleTokens, REFRESHED_TOKENS)
            assert.deepEqual(published, [user])
        })

        test('clears them when given none', async () => {
            await repository.updateGoogleTokens(USERNAME, REFRESHED_TOKENS)

            await service().saveTokens(USERNAME, null)

            const stored = await storedTokens()
            assert.equal(stored, null)
            assert.equal(credentialsFile[USERNAME], null)
        })

        // The database is the source of truth, and the gee module reads tokens off the user as well as
        // off the file — so a file that could not be written must not fail the request.
        test('stores and publishes even when the credentials file cannot be written', async () => {
            const user = await service({
                saveCredentials: async () => {
                    throw new Error('disk full')
                }
            }).saveTokens(USERNAME, REFRESHED_TOKENS)

            const stored = await storedTokens()
            assert.deepEqual(stored, REFRESHED_TOKENS)
            assert.deepEqual(user.googleTokens, REFRESHED_TOKENS)
            assert.deepEqual(published, [user])
        })
    })

    const service = (over = {}) => new GoogleService({
        repository,
        googleOAuth: refreshingTo(REFRESHED_TOKENS),
        saveCredentials: async (username, tokens) => {
            credentialsFile[username] = tokens
        },
        publishUserUpdated: user => published.push(user),
        clock: () => now,
        ...over
    })

    // Keeps what it is given, so a read after a write shows the write.
    const aRepository = () => {
        const users = {[USERNAME]: {username: USERNAME, id: 1, googleTokens: null}}
        return {
            findByUsername: async username => users[username] ?? null,
            updateGoogleTokens: async (username, tokens) => {
                users[username] = {...users[username], googleTokens: tokens}
            }
        }
    }

    const storedTokens = async () => (await repository.findByUsername(USERNAME)).googleTokens

    const refreshingTo = tokens => ({refreshAccessToken: async () => tokens})

    const failingToRefresh = error => ({
        refreshAccessToken: async () => {
            throw error
        }
    })

    const refusingToRefresh = () => ({
        refreshAccessToken: async () => {
            throw new Error('should not have been refreshed')
        }
    })

    const tokensExpiringIn = milliseconds => ({
        refreshToken: 'RT', accessToken: 'AT', accessTokenExpiryDate: now.getTime() + milliseconds,
        projectId: null, legacyProject: false
    })

    const MINUTE = 60 * 1000
    const NOW = new Date('2026-07-01T12:00:00Z')
    const USERNAME = 'bob'
    const REFRESHED_TOKENS = {
        refreshToken: 'RT', accessToken: 'NEW', accessTokenExpiryDate: NOW.getTime() + 3600_000,
        projectId: null, legacyProject: false
    }
})
