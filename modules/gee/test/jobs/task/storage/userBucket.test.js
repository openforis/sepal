import {jest} from '@jest/globals'

jest.unstable_mockModule('#gee/config', () => ({sepalHost: 'sepal.test', googleRegion: 'EUROPE-WEST2', googleProjectId: 'p', serviceAccountCredentials: {client_email: 'sa@p.iam.gserviceaccount.com'}}))

const {userBucketName} = await import('#gee/jobs/task/storage/userBucket')

test('each user has a bucket of their own, named for the host', () => {
    expect(userBucketName('alice')).toMatch(/^sepal-exports-[0-9a-f]{24}$/)
    expect(userBucketName('alice')).not.toBe(userBucketName('bob'))
    expect(userBucketName('alice')).toBe(userBucketName('alice'))
})
