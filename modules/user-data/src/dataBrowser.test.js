import {Readable} from 'node:stream'

import {ClientException, NotFoundException} from '#sepal/exception'
import {configureNoLogging} from '#sepal/log'

import {Attachments} from './attachments.js'
import {DataBrowser} from './dataBrowser.js'
import {Providers} from './providers/providers.js'

beforeAll(() => configureNoLogging())

describe('list', () => {
    it('lists the attachment root for data', async () => {
        const {browser, provider} = harness({listing: [{name: 'a.txt', file: true, size: 2, mtime: 5}, {name: 'dir', dir: true}]})

        const items = await browser.list('alice', 'data')

        expect(provider.calls).toEqual([['list', 'alice', '']])
        expect(items).toEqual({'a.txt': {file: true, size: 2, mtime: 5}, dir: {dir: true}})
    })

    it('maps a path below data to the attachment', async () => {
        const {browser, provider} = harness({listing: []})

        await browser.list('alice', 'data/dir/sub')

        expect(provider.calls).toEqual([['list', 'alice', 'dir/sub']])
    })

    it.each(['', 'downloads', 'data/../x', 'data/a/../../b', 'data//x', 'data/.', 'data/a\\b', 'data/%2e%2e', 'data/%2E', 'data/%zz', 'data/a\0b', 'datax'])(
        'refuses %p before calling the provider', async path => {
            const {browser, provider} = harness({listing: []})

            await expect(browser.list('alice', path)).rejects.toThrow(ClientException)
            expect(provider.calls).toEqual([])
        })
})

describe('remove', () => {
    it('removes each path and has the usage measured again', async () => {
        const {browser, provider, usage} = harness({})

        await browser.remove('alice', ['data/a.txt', 'data/dir'])

        expect(provider.calls).toEqual([['remove', 'alice', 'a.txt'], ['remove', 'alice', 'dir']])
        expect(usage.dirty).toEqual(['alice'])
    })

    it('has the usage measured again when a later removal fails', async () => {
        const {browser, provider, usage} = harness({})
        const failure = new Error('boom')
        provider.remove = async (_attachment, relPath) => {
            if (relPath === 'b') {
                throw failure
            }
        }

        await expect(browser.remove('alice', ['data/a', 'data/b'])).rejects.toBe(failure)
        expect(usage.dirty).toEqual(['alice'])
    })

    it('refuses to remove the Data root', async () => {
        const {browser, provider} = harness({})

        await expect(browser.remove('alice', ['data'])).rejects.toThrow(ClientException)
        expect(provider.calls).toEqual([])
    })

    it('removes nothing when any path is invalid', async () => {
        const {browser, provider} = harness({})

        await expect(browser.remove('alice', ['data/a.txt', 'data/../x'])).rejects.toThrow(ClientException)
        expect(provider.calls).toEqual([])
    })
})

describe('download', () => {
    it('redirects to a presigned link', async () => {
        const {browser} = harness({emulator: false})

        expect(await browser.download('alice', 'data/dir/b.txt')).toEqual({redirect: 'https://signed/users/alice/dir/b.txt'})
    })

    it('streams the file in emulator mode', async () => {
        const {browser} = harness({emulator: true})

        expect(await browser.download('alice', 'data/dir/b.txt')).toMatchObject({filename: 'b.txt', size: 5})
    })

    it('reports a missing file in emulator mode as not found', async () => {
        const {browser, provider} = harness({emulator: true})
        provider.download = async () => {
            throw Object.assign(new Error('missing'), {name: 'NoSuchKey'})
        }

        await expect(browser.download('alice', 'data/gone.txt')).rejects.toThrow(NotFoundException)
    })

    it('refuses the Data root, which is not a file', async () => {
        const {browser} = harness({emulator: false})

        await expect(browser.download('alice', 'data')).rejects.toThrow(ClientException)
    })
})

const harness = ({listing = [], emulator = false}) => {
    const calls = []
    const provider = {
        calls,
        list: async (attachment, relPath) => {
            calls.push(['list', attachment.owner, relPath])
            return listing
        },
        remove: async (attachment, relPath) => {
            calls.push(['remove', attachment.owner, relPath])
        },
        downloadUrl: async (attachment, relPath) => `https://signed/users/${attachment.owner}/${relPath}`,
        download: async () => ({stream: Readable.from(['hello']), size: 5, contentType: 'text/plain'}),
        isEmulator: () => emulator
    }
    const usage = {dirty: [], markDirty: async username => { usage.dirty.push(username) }}
    const browser = new DataBrowser({
        attachments: new Attachments({bucket: 'b'}),
        providers: new Providers({s3: provider}),
        usage
    })
    return {browser, provider, usage}
}
