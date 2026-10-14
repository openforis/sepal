import {randomUUID} from 'node:crypto'

import {DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client} from '@aws-sdk/client-s3'

import {Attachments} from '../attachments.js'
import {createS3Provider, dataBucketName} from './s3.js'

// Runs on a real bucket only (the test deployment): no emulator evaluates IAM policies.
const ENABLED = process.env.USER_DATA_AWS_ISOLATION_TEST === 'true'

// describe.skip would still run the suite's body, which reads the AWS settings.
const describeOnAws = ENABLED
    ? describe
    : name => describe.skip(name, () => it('runs with USER_DATA_AWS_ISOLATION_TEST=true', () => {}))

describeOnAws('prefix isolation on AWS', () => {
    const config = awsConfig()
    let provider
    const attachments = new Attachments({bucket: config.bucket})
    const run = randomUUID()
    const own = (user, name = 'object.txt') => `${attachments.get(user, 'data').location.prefix}${run}/${name}`

    beforeAll(async () => {
        provider = await createS3Provider(config)
        for (const user of ['isolationA', 'isolationA2', 'isolationB']) {
            const client = await clientFor(user, 'readWrite')
            await client.send(new PutObjectCommand({Bucket: config.bucket, Key: own(user), Body: user}))
        }
    })

    afterAll(async () => {
        for (const user of ['isolationA', 'isolationA2', 'isolationB']) {
            const client = await clientFor(user, 'readWrite')
            await client.send(new DeleteObjectCommand({Bucket: config.bucket, Key: own(user)}))
            await client.send(new DeleteObjectCommand({Bucket: config.bucket, Key: own(user, 'written.txt')}))
        }
    })

    it('lets a user read, write and list their own prefix', async () => {
        const client = await clientFor('isolationA', 'readWrite')

        await client.send(new PutObjectCommand({Bucket: config.bucket, Key: own('isolationA', 'written.txt'), Body: 'x'}))
        const listed = await client.send(new ListObjectsV2Command({Bucket: config.bucket, Prefix: `users/isolationA/${run}/`}))

        expect(listed.Contents.map(({Key}) => Key)).toEqual(expect.arrayContaining([own('isolationA'), own('isolationA', 'written.txt')]))
    })

    it('lets a user list the attachment root and read their own object', async () => {
        const client = await clientFor('isolationA', 'readWrite')

        const root = await client.send(new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: attachments.get('isolationA', 'data').location.prefix,
            Delimiter: '/'
        }))
        const read = await client.send(new GetObjectCommand({Bucket: config.bucket, Key: own('isolationA')}))

        expect(root.CommonPrefixes.map(({Prefix}) => Prefix)).toContain(`users/isolationA/${run}/`)
        expect(await read.Body.transformToString()).toBe('isolationA')
    })

    it.each([
        ['read', client => client.send(new GetObjectCommand({Bucket: config.bucket, Key: own('isolationB')}))],
        ['overwrite', client => client.send(new PutObjectCommand({Bucket: config.bucket, Key: own('isolationB'), Body: 'x'}))],
        ['delete', client => client.send(new DeleteObjectCommand({Bucket: config.bucket, Key: own('isolationB')}))],
        ['list', client => client.send(new ListObjectsV2Command({Bucket: config.bucket, Prefix: 'users/isolationB/'}))]
    ])('forbids a user to %s another user\'s objects', async (_operation, operation) => {
        const client = await clientFor('isolationA', 'readWrite')

        await expect(operation(client)).rejects.toMatchObject({name: 'AccessDenied'})
    })

    it.each([
        ['the look-alike prefix of a longer username', 'users/isolationA2/'],
        ['the username without its trailing slash', 'users/isolationA'],
        ['the root of the bucket', '']
    ])('denies listing %s', async (_case, prefix) => {
        const client = await clientFor('isolationA', 'readWrite')

        await expect(client.send(new ListObjectsV2Command({Bucket: config.bucket, Prefix: prefix})))
            .rejects.toMatchObject({name: 'AccessDenied'})
    })

    it('denies reading the object of a look-alike username', async () => {
        const client = await clientFor('isolationA', 'readWrite')

        await expect(client.send(new GetObjectCommand({Bucket: config.bucket, Key: own('isolationA2')})))
            .rejects.toMatchObject({name: 'AccessDenied'})
    })

    it('lets read credentials read the own prefix but not write or delete in it', async () => {
        const client = await clientFor('isolationA', 'read')

        const read = await client.send(new GetObjectCommand({Bucket: config.bucket, Key: own('isolationA')}))

        expect(await read.Body.transformToString()).toBe('isolationA')
        await expect(client.send(new PutObjectCommand({Bucket: config.bucket, Key: own('isolationA', 'written.txt'), Body: 'x'})))
            .rejects.toMatchObject({name: 'AccessDenied'})
        await expect(client.send(new DeleteObjectCommand({Bucket: config.bucket, Key: own('isolationA')})))
            .rejects.toMatchObject({name: 'AccessDenied'})
    })

    async function clientFor(user, mode) {
        const credentials = await provider.credentials(attachments.get(user, 'data'), {mode})
        return new S3Client({
            region: config.region,
            credentials: {
                accessKeyId: credentials.AccessKeyId,
                secretAccessKey: credentials.SecretAccessKey,
                sessionToken: credentials.Token
            }
        })
    }
})

function awsConfig() {
    return {
        region: process.env.AWS_REGION,
        bucket: dataBucketName(process.env.DEPLOY_ENVIRONMENT),
        deployEnvironment: process.env.DEPLOY_ENVIRONMENT,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        emulator: false
    }
}
