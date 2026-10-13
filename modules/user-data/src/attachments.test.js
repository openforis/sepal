import {NotFoundException} from '#sepal/exception'

import {Attachments, DATA_ATTACHMENT_ID} from './attachments.js'

describe('Attachments', () => {
    it('give every user the built-in Data attachment on their own prefix of the shared bucket', () => {
        const attachments = new Attachments({bucket: BUCKET})

        const list = attachments.list('alice')

        expect(list).toEqual([{
            id: DATA_ATTACHMENT_ID,
            name: 'Data',
            owner: 'alice',
            provider: 's3',
            location: {bucket: BUCKET, prefix: 'users/alice/'},
            mountPath: 'data',
            quota: true
        }])
    })

    it('end the prefix with a slash, so one username is never a prefix of another', () => {
        const attachments = new Attachments({bucket: BUCKET})

        const {location} = attachments.get('alice', DATA_ATTACHMENT_ID)

        expect(location.prefix).toBe('users/alice/')
        expect('users/alice2/x'.startsWith(location.prefix)).toBe(false)
    })

    it('find an attachment by id', () => {
        const attachments = new Attachments({bucket: BUCKET})

        expect(attachments.get('alice', DATA_ATTACHMENT_ID).owner).toBe('alice')
    })

    it('name the provider of Data', () => {
        const attachments = new Attachments({bucket: BUCKET})

        expect(attachments.dataProvider()).toBe(attachments.get('alice', DATA_ATTACHMENT_ID).provider)
    })

    it('refuse an unknown attachment id as not found', () => {
        const attachments = new Attachments({bucket: BUCKET})

        expect(() => attachments.get('alice', 'dropbox')).toThrow(NotFoundException)
    })
})

const BUCKET = 'sepal-test-user-data'
