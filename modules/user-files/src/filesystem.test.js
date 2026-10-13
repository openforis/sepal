import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import Path from 'node:path'

import {configureNoLogging} from '#sepal/log'

import {email$} from './email.js'
import {createFolder, download, listFiles, setFile} from './filesystem.js'

const MESSAGE = 'Data is managed by user-data'

let homeDir
let emailSubscription

beforeAll(() => configureNoLogging())

beforeEach(async () => {
    homeDir = await mkdtemp(Path.join(tmpdir(), 'user-files-'))
    await mkdir(Path.join(homeDir, 'alice', 'docs'), {recursive: true})
    await writeFile(Path.join(homeDir, 'alice', 'docs', 'a.txt'), 'hello')
})

afterEach(async () => {
    emailSubscription?.unsubscribe()
    await rm(homeDir, {recursive: true, force: true})
})

describe('listFiles', () => {
    it('leaves an empty data folder in place and omits it from the home listing', async () => {
        await mkdir(Path.join(homeDir, 'alice', 'data'))

        const ctx = await listing('')

        expect(ctx.body.files.map(({name}) => name)).toEqual(['docs'])
        await expect(readdir(Path.join(homeDir, 'alice', 'data'))).resolves.toEqual([])
    })

    it('moves a non-empty data folder to data.local, lists it and tells the user', async () => {
        await mkdir(Path.join(homeDir, 'alice', 'data'))
        await writeFile(Path.join(homeDir, 'alice', 'data', 'mine.txt'), 'x')
        const emails = recordEmails()

        const ctx = await listing('')

        expect(ctx.body.files.map(({name}) => name)).toEqual(['data.local', 'docs'])
        await expect(readdir(Path.join(homeDir, 'alice', 'data.local'))).resolves.toEqual(['mine.txt'])
        expect(emails).toEqual([expect.objectContaining({username: 'alice', content: expect.stringContaining('~/data.local')})])
    })

    it('moves a file named data to data.local', async () => {
        await writeFile(Path.join(homeDir, 'alice', 'data'), 'x')

        const ctx = await listing('')

        expect(ctx.body.files.map(({name}) => name)).toEqual(['docs', 'data.local'])
    })

    it('moves data to data.local.1 when data.local is taken', async () => {
        await writeFile(Path.join(homeDir, 'alice', 'data.local'), 'taken')
        await writeFile(Path.join(homeDir, 'alice', 'data'), 'x')

        const ctx = await listing('')

        expect(ctx.body.files.map(({name}) => name)).toEqual(['docs', 'data.local', 'data.local.1'])
    })

    it('moves nothing when listing a folder other than the home', async () => {
        await writeFile(Path.join(homeDir, 'alice', 'data'), 'x')

        await listing('docs')

        await expect(readFile(Path.join(homeDir, 'alice', 'data'), 'utf8')).resolves.toBe('x')
    })

    it('still lists an ordinary directory', async () => {
        const ctx = await listing('docs')

        expect(ctx.body.files.map(({name}) => name)).toEqual(['a.txt'])
    })

    it.each([
        ['an existing data folder', true],
        ['a missing data folder', false]
    ])('refuses to list %s', async (_name, exists) => {
        if (exists) {
            await mkdir(Path.join(homeDir, 'alice', 'data'))
        }

        const ctx = await listing('data')

        expectRefused(ctx)
    })
})

describe('download', () => {
    it.each([
        ['an existing file', true],
        ['a missing file', false]
    ])('refuses to download %s under data', async (_name, exists) => {
        if (exists) {
            await mkdir(Path.join(homeDir, 'alice', 'data'))
            await writeFile(Path.join(homeDir, 'alice', 'data', 'x.txt'), 'x')
        }
        const ctx = requestCtx({query: {path: 'data/x.txt'}})

        await download(homeDir, ctx)

        expectRefused(ctx)
    })

    it('still downloads an ordinary file', async () => {
        const ctx = requestCtx({query: {path: 'docs/a.txt'}})

        await download(homeDir, ctx)

        expect(ctx.body).toBeDefined()
        ctx.body.destroy()
        expect(ctx.response.status).not.toBe(403)
    })
})

describe('setFile', () => {
    it('refuses to write under data and leaves the disk untouched', async () => {
        const upload = Path.join(homeDir, 'upload.tmp')
        await writeFile(upload, 'x')
        const ctx = requestCtx({query: {path: 'data/x.txt'}, files: {file: {filepath: upload}}})

        await setFile(homeDir, ctx)

        expectRefused(ctx)
        await expect(listing('')).resolves.toMatchObject({body: {count: 1}})
    })
})

describe('createFolder', () => {
    it('refuses to create a folder under data', async () => {
        const ctx = requestCtx({query: {path: 'data/x', recursive: 'true'}})

        await createFolder(homeDir, ctx)

        expectRefused(ctx)
        await expect(listing('')).resolves.toMatchObject({body: {files: [{name: 'docs'}]}})
    })
})

async function listing(path) {
    const ctx = requestCtx({query: {path}})
    await listFiles(homeDir, ctx)
    return ctx
}

function recordEmails() {
    const emails = []
    emailSubscription = email$.subscribe(email => emails.push(email))
    return emails
}

function requestCtx({query, files}) {
    return {
        request: {headers: {'sepal-user': JSON.stringify({username: 'alice'})}, files},
        query,
        response: {},
        attachment: () => {}
    }
}

function expectRefused(ctx) {
    expect(ctx.response.status).toBe(403)
    expect(ctx.body).toEqual({message: MESSAGE})
}
