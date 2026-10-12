import {ServerException} from '#sepal/exception'

import {Providers} from './providers.js'

describe('Providers', () => {
    it('resolve the provider an attachment names', () => {
        const s3 = {name: 'fake s3'}
        const providers = new Providers({s3})

        expect(providers.for({id: 'data', provider: 's3'})).toBe(s3)
    })

    it('refuse an attachment whose provider is not registered', () => {
        const providers = new Providers({s3: {}})

        expect(() => providers.for({id: 'box', provider: 'dropbox'})).toThrow(ServerException)
    })
})
