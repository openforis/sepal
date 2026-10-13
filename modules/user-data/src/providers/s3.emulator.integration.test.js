import {randomUUID} from 'node:crypto'

import {GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client} from '@aws-sdk/client-s3'
import {getSignedUrl} from '@aws-sdk/s3-request-presigner'

import {Attachments} from '../attachments.js'
import {createS3Provider, dataBucketName} from './s3.js'

const EMULATOR = process.env.USER_DATA_S3_EMULATOR === 'true'

const describeWithEmulator = EMULATOR ? describe : describe.skip

describeWithEmulator('S3 adapter against the dev-env emulator', () => {
    const config = emulatorConfig()
    let provider
    const owners = new Set()
    const attachment = attachmentsFor('emulatortest')

    beforeAll(async () => {
        provider = await createS3Provider(config)
    })

    afterAll(async () => {
        for (const owner of owners) {
            await provider.erase(attachmentsFor(owner))
        }
    })

    it('grants task access that writes, lists and reads the user prefix', async () => {
        const client = await taskClient(provider, attachment)
        const key = `${attachment.location.prefix}${randomUUID()}.txt`

        await client.send(new PutObjectCommand({Bucket: config.bucket, Key: key, Body: 'hello'}))
        const listed = await client.send(new ListObjectsV2Command({Bucket: config.bucket, Prefix: attachment.location.prefix}))
        const read = await client.send(new GetObjectCommand({Bucket: config.bucket, Key: key}))

        expect(listed.Contents.map(({Key}) => Key)).toContain(key)
        expect(await read.Body.transformToString()).toBe('hello')
    })

    it('serves presigned downloads', async () => {
        const client = await taskClient(provider, attachment)
        const key = `${attachment.location.prefix}${randomUUID()}.txt`
        await client.send(new PutObjectCommand({Bucket: config.bucket, Key: key, Body: 'presigned'}))

        const url = await getSignedUrl(client, new GetObjectCommand({Bucket: config.bucket, Key: key}), {expiresIn: 900})
        const response = await fetch(url)

        expect(response.status).toBe(200)
        expect(await response.text()).toBe('presigned')
    })

    it('measures the bytes stored under the user prefix only', async () => {
        const owner = `measure${randomUUID().replaceAll('-', '')}`.slice(0, 30)
        const attachment = attachmentsFor(owner)
        const client = await taskClient(provider, attachment)
        await client.send(new PutObjectCommand({Bucket: config.bucket, Key: `${attachment.location.prefix}a.txt`, Body: 'x'.repeat(100)}))
        await client.send(new PutObjectCommand({Bucket: config.bucket, Key: `${attachment.location.prefix}dir/b.txt`, Body: 'y'.repeat(50)}))

        expect(await provider.measureUsage(attachment)).toBe(150)
    })

    it('measures nothing for a user without Data', async () => {
        expect(await provider.measureUsage(attachmentsFor('nodatayet'))).toBe(0)
    })

    it('lists the users that have Data', async () => {
        const owner = `owner${randomUUID().replaceAll('-', '')}`.slice(0, 30)
        const attachment = attachmentsFor(owner)
        const client = await taskClient(provider, attachment)
        await client.send(new PutObjectCommand({Bucket: config.bucket, Key: `${attachment.location.prefix}x.txt`, Body: 'x'}))

        expect(await provider.owners()).toContain(owner)
    })

    it('erases everything under the user prefix, and nothing else', async () => {
        const owner = `erase${randomUUID().replaceAll('-', '')}`.slice(0, 30)
        const other = `keep${randomUUID().replaceAll('-', '')}`.slice(0, 30)
        for (const user of [owner, other]) {
            const client = await taskClient(provider, attachmentsFor(user))
            await client.send(new PutObjectCommand({Bucket: config.bucket, Key: `${attachmentsFor(user).location.prefix}x.txt`, Body: 'x'}))
        }

        await provider.erase(attachmentsFor(owner))

        expect(await provider.measureUsage(attachmentsFor(owner))).toBe(0)
        expect(await provider.measureUsage(attachmentsFor(other))).toBe(1)
    })

    it('erases only what was stored before the given time', async () => {
        const owner = `before${randomUUID().replaceAll('-', '')}`.slice(0, 30)
        const attachment = attachmentsFor(owner)
        const client = await taskClient(provider, attachment)
        await client.send(new PutObjectCommand({Bucket: config.bucket, Key: `${attachment.location.prefix}old.txt`, Body: 'x'.repeat(10)}))
        const [{LastModified}] = (await client.send(new ListObjectsV2Command({Bucket: config.bucket, Prefix: attachment.location.prefix}))).Contents
        await sleep(1100)
        await client.send(new PutObjectCommand({Bucket: config.bucket, Key: `${attachment.location.prefix}new.txt`, Body: 'y'.repeat(5)}))

        await provider.erase(attachment, {before: new Date(LastModified.getTime() + 1)})

        expect(await provider.measureUsage(attachment)).toBe(5)
    })

    function attachmentsFor(owner) {
        owners.add(owner)
        return new Attachments({bucket: config.bucket}).get(owner, 'data')
    }
})

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function emulatorConfig() {
    return {
        region: process.env.AWS_REGION,
        bucket: dataBucketName(process.env.DEPLOY_ENVIRONMENT),
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        endpoint: process.env.USER_DATA_S3_ENDPOINT,
        emulator: true
    }
}

async function taskClient(provider, attachment) {
    const {rclone: {options}} = await provider.grantAccess(attachment, {mode: 'readWrite', purpose: 'task'})
    return new S3Client({
        region: options.region,
        endpoint: options.endpoint,
        forcePathStyle: true,
        credentials: {
            accessKeyId: options.access_key_id,
            secretAccessKey: options.secret_access_key,
            sessionToken: options.session_token
        }
    })
}
