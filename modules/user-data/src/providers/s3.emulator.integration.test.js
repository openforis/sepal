import {randomUUID} from 'node:crypto'

import {GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client} from '@aws-sdk/client-s3'
import {getSignedUrl} from '@aws-sdk/s3-request-presigner'

import {Attachments} from '../attachments.js'
import {createS3Provider, dataBucketName} from './s3.js'

const EMULATOR = process.env.USER_DATA_S3_EMULATOR === 'true'

// describe.skip would still run the suite's body, which reads the emulator's settings.
const describeWithEmulator = EMULATOR
    ? describe
    : name => describe.skip(name, () => it('runs with USER_DATA_S3_EMULATOR=true', () => {}))

describeWithEmulator('S3 adapter against the dev-env emulator', () => {
    const config = emulatorConfig()
    let provider
    const owners = new Set()
    const attachment = attachmentsFor('emulatortest')

    beforeAll(async () => {
        provider = await createS3Provider(config)
    })

    afterAll(async () => {
        await eraseAllOwners()
        const leftover = (await provider.owners()).filter(owner => owners.has(owner))
        if (leftover.length) {
            throw new Error(`Emulator users left behind by the tests: ${leftover.join(', ')}`)
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

    describe('browsing', () => {
        it('lists one level: files with size and time, folders from prefixes', async () => {
            const attachment = attachmentsFor(uniqueUser('list'))
            await put(attachment, 'a.txt', 'xx')
            await put(attachment, 'dir/b.txt', 'yyy')
            await put(attachment, 'dir/sub/c.txt', 'z')

            const root = await provider.list(attachment, '')
            const dir = await provider.list(attachment, 'dir')

            expect(sortByName(root)).toEqual([
                {name: 'a.txt', file: true, size: 2, mtime: expect.any(Number)},
                {name: 'dir', dir: true}
            ])
            expect(sortByName(dir)).toEqual([
                {name: 'b.txt', file: true, size: 3, mtime: expect.any(Number)},
                {name: 'sub', dir: true}
            ])
        })

        it('lists nothing for a folder that does not exist', async () => {
            expect(await provider.list(attachmentsFor(uniqueUser('none')), 'missing')).toEqual([])
        })

        it('removes a folder and everything under it, but not a sibling with the same prefix', async () => {
            const attachment = attachmentsFor(uniqueUser('rmdir'))
            await put(attachment, 'dir/b.txt', 'y')
            await put(attachment, 'dir/sub/c.txt', 'z')
            await put(attachment, 'dirx/keep.txt', 'k')

            await provider.remove(attachment, 'dir')

            expect(sortByName(await provider.list(attachment, ''))).toEqual([{name: 'dirx', dir: true}])
        })

        it('removes a folder of more objects than one listing page holds', async () => {
            const attachment = attachmentsFor(uniqueUser('rmmany'))
            const names = Array.from({length: 1001}, (_, i) => `big/${String(i).padStart(4, '0')}.txt`)
            for (let i = 0; i < names.length; i += 50) {
                await Promise.all(names.slice(i, i + 50).map(name => put(attachment, name, 'x')))
            }
            const client = await taskClient(provider, attachment)
            const firstPage = await client.send(new ListObjectsV2Command({Bucket: config.bucket, Prefix: `${attachment.location.prefix}big/`}))
            expect(firstPage.IsTruncated).toBe(true)

            await provider.remove(attachment, 'big')

            expect(await provider.measureUsage(attachment)).toBe(0)
        }, 120000)

        it('removes a single file', async () => {
            const attachment = attachmentsFor(uniqueUser('rmfile'))
            await put(attachment, 'a.txt', 'x')
            await put(attachment, 'b.txt', 'y')

            await provider.remove(attachment, 'a.txt')

            expect((await provider.list(attachment, '')).map(({name}) => name)).toEqual(['b.txt'])
        })

        it('lists, downloads and removes files whose names need url encoding', async () => {
            const attachment = attachmentsFor(uniqueUser('enc'))
            await put(attachment, 'growth_10%.csv', 'pct')
            await put(attachment, 'a b+c.txt', 'x')
            await put(attachment, 'my dir/d e%.txt', 'y')

            const root = await provider.list(attachment, '')
            const {stream} = await provider.download(attachment, 'growth_10%.csv')
            await provider.remove(attachment, 'my dir')

            expect(sortByName(root).map(({name}) => name)).toEqual(['a b+c.txt', 'growth_10%.csv', 'my dir'])
            expect(await streamToString(stream)).toBe('pct')
            expect((await provider.list(attachment, '')).map(({name}) => name).sort()).toEqual(['a b+c.txt', 'growth_10%.csv'])
            await provider.erase(attachment)
            expect(await provider.measureUsage(attachment)).toBe(0)
        })

        it('streams a file for download', async () => {
            const attachment = attachmentsFor(uniqueUser('dl'))
            await put(attachment, 'dir/b.txt', 'hello')

            const {stream, size} = await provider.download(attachment, 'dir/b.txt')

            expect(size).toBe(5)
            expect(await streamToString(stream)).toBe('hello')
        })

        async function put(attachment, rel, body) {
            const client = await taskClient(provider, attachment)
            await client.send(new PutObjectCommand({Bucket: config.bucket, Key: `${attachment.location.prefix}${rel}`, Body: body}))
        }
    })

    // Every owner passes through attachmentsFor, so none created by a test can escape cleanup.
    async function eraseAllOwners() {
        const failures = []
        for (const owner of owners) {
            try {
                await provider.erase(attachmentsFor(owner))
            } catch (error) {
                failures.push(`${owner}: ${error.message}`)
            }
        }
        if (failures.length) {
            throw new Error(`Cannot erase emulator users: ${failures.join('; ')}`)
        }
    }

    function attachmentsFor(owner) {
        owners.add(owner)
        return new Attachments({bucket: config.bucket}).get(owner, 'data')
    }
})

function uniqueUser(tag) {
    return `${tag}${randomUUID().replaceAll('-', '')}`.slice(0, 30)
}

function sortByName(entries) {
    return [...entries].sort((a, b) => a.name.localeCompare(b.name))
}

async function streamToString(stream) {
    const chunks = []
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks).toString()
}

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
