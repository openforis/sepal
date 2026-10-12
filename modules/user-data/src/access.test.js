import {ClientException, NotFoundException} from '#sepal/exception'

import {Access, AUTHORIZATION_TOKEN_FILE} from './access.js'
import {Attachments} from './attachments.js'
import {Providers} from './providers/providers.js'

describe('list', () => {
    it('shows the attachments without their provider-specific location', () => {
        const access = accessWith(fakeProvider())

        expect(access.list('alice')).toEqual([{id: 'data', name: 'Data', mountPath: 'data', quota: true}])
    })
})

describe('grant', () => {
    it('asks the provider for read-write access with the credentials endpoint of the attachment', async () => {
        const provider = fakeProvider()
        const access = accessWith(provider)

        const granted = await access.grant('alice', 'data', 'sandbox')

        expect(provider.grants).toEqual([{
            owner: 'alice',
            request: {
                mode: 'readWrite',
                purpose: 'sandbox',
                credentialsUrl: `https://${SEPAL_HOST}/api/user-data/attachments/data/credentials`,
                authorizationTokenFile: AUTHORIZATION_TOKEN_FILE
            }
        }])
        expect(granted).toEqual({attachment: 'data', mode: 'readWrite', ...provider.granted})
    })

    it.each([undefined, '', 'admin'])('refuses the purpose %p as a bad request', async purpose => {
        const provider = fakeProvider()
        const access = accessWith(provider)

        await expect(access.grant('alice', 'data', purpose)).rejects.toThrow(ClientException)
        expect(provider.grants).toEqual([])
    })

    it('refuses an unknown attachment as not found', async () => {
        const access = accessWith(fakeProvider())

        await expect(access.grant('alice', 'dropbox', 'sandbox')).rejects.toThrow(NotFoundException)
    })
})

describe('credentials', () => {
    it('are the provider credentials of the user attachment in read-write mode', async () => {
        const provider = fakeProvider()
        const access = accessWith(provider)

        const credentials = await access.credentials('alice', 'data')

        expect(credentials).toBe(provider.issued)
        expect(provider.credentialRequests).toEqual([{owner: 'alice', mode: 'readWrite'}])
    })
})

const SEPAL_HOST = 'sepal.example.org'

const accessWith = provider => new Access({
    attachments: new Attachments({bucket: 'sepal-test-user-data'}),
    providers: new Providers({s3: provider}),
    sepalHost: SEPAL_HOST
})

const fakeProvider = () => {
    const provider = {
        grants: [],
        credentialRequests: [],
        granted: {rclone: {type: 's3', root: 'bucket/users/alice', options: {}}, env: {}},
        issued: {AccessKeyId: 'ASIA0'},
        grantAccess: async (attachment, request) => {
            provider.grants.push({owner: attachment.owner, request})
            return provider.granted
        },
        credentials: async (attachment, {mode}) => {
            provider.credentialRequests.push({owner: attachment.owner, mode})
            return provider.issued
        }
    }
    return provider
}
