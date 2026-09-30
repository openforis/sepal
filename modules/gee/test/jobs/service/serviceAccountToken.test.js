import {jest} from '@jest/globals'
import {firstValueFrom} from 'rxjs'

jest.unstable_mockModule('#gee/config', () => ({
    serviceAccountCredentials: {client_email: 'sepal@sepal-test-project.iam.gserviceaccount.com', private_key: 'test-key'}
}))

const {ServiceAccountToken} = await import('#gee/jobs/service/serviceAccountToken')

const MINUTE = 60 * 1000

describe('the service-account token', () => {
    test('is reused until five minutes before it expires', async () => {
        const client = fakeClient()
        const clock = {now: 0}
        const token = new ServiceAccountToken({client, now: () => clock.now})

        await firstValueFrom(token.token$())
        clock.now = 4 * MINUTE
        const reused = await firstValueFrom(token.token$())

        expect(client.authorizations).toBe(1)
        expect(reused).toEqual({accessToken: 'token-1', expiresAt: 10 * MINUTE})
    })

    test('is fetched again within five minutes of expiring', async () => {
        const client = fakeClient()
        const clock = {now: 0}
        const token = new ServiceAccountToken({client, now: () => clock.now})

        await firstValueFrom(token.token$())
        clock.now = 6 * MINUTE
        const renewed = await firstValueFrom(token.token$())

        expect(client.authorizations).toBe(2)
        expect(renewed.accessToken).toBe('token-2')
    })

    test('is fetched once for callers arriving while it is being fetched', async () => {
        const client = fakeClient()
        const token = new ServiceAccountToken({client, now: () => 0})

        await Promise.all([firstValueFrom(token.token$()), firstValueFrom(token.token$())])

        expect(client.authorizations).toBe(1)
    })

    test('is fetched again by the next caller after a failed fetch', async () => {
        const client = fakeClient({failFirst: true})
        const token = new ServiceAccountToken({client, now: () => 0})

        await expect(firstValueFrom(token.token$())).rejects.toThrow('unavailable')
        const fetched = await firstValueFrom(token.token$())

        expect(fetched.accessToken).toBe('token-2')
    })
})

const fakeClient = ({failFirst = false} = {}) => {
    const client = {
        authorizations: 0,
        authorize: async () => {
            client.authorizations++
            if (failFirst && client.authorizations === 1) {
                throw new Error('unavailable')
            }
            return {access_token: `token-${client.authorizations}`, expiry_date: 10 * MINUTE}
        }
    }
    return client
}
