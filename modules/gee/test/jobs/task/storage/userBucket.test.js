import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

mock.module('#gee/config', {
    exports: {
        sepalHost: 'sepal.test',
        googleRegion: 'EUROPE-WEST2',
        googleProjectId: 'p',
        serviceAccountCredentials: {client_email: 'sa@p.iam.gserviceaccount.com'}
    }
})

const {userBucketName} = await import('#gee/jobs/task/storage/userBucket')

test('each user has a bucket of their own, named for the host', () => {
    assert.match(userBucketName('alice'), /^sepal-exports-[0-9a-f]{24}$/)
    assert.notEqual(userBucketName('alice'), userBucketName('bob'))
    assert.equal(userBucketName('alice'), userBucketName('alice'))
})
