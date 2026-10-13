import {Readable} from 'node:stream'

import {ClientException} from '#sepal/exception'
import * as server from '#sepal/httpServer'
import {configureNoLogging} from '#sepal/log'

import {createRoutes} from './routes.js'

const USER = JSON.stringify({username: 'alice', roles: []})

let httpServer
let base
let download
let listing
let listThrows
let listed
let measuredSoon

beforeEach(() => {
    listing = {}
    listThrows = undefined
    listed = []
    measuredSoon = []
})

beforeAll(async () => {
    configureNoLogging()
    const access = {
        list: () => [],
        grant: async () => ({}),
        credentials: async () => ({})
    }
    const browser = {
        download: (username, path) => download(username, path),
        list: async (username, path) => {
            listed.push([username, path])
            if (listThrows) {
                throw listThrows
            }
            return listing
        }
    }
    const usage = {measureSoon: username => measuredSoon.push(username)}
    httpServer = await server.start({port: 0, routes: createRoutes(access, browser, usage), metricsMiddleware: (_ctx, next) => next()})
    base = `http://127.0.0.1:${httpServer.address().port}`
})

afterAll(() => new Promise(resolve => httpServer.close(resolve)))

describe('authentication', () => {
    it.each([
        ['GET', '/attachments'],
        ['POST', '/attachments/data/access'],
        ['GET', '/attachments/data/credentials'],
        ['GET', '/attachments/data/download?path=data'],
        ['GET', '/attachments/data/files?path=x'],
        ['POST', '/attachments/data/changed']
    ])('answers 401 to %s %s without a user', async (method, path) => {
        const response = await fetch(base + path, {method})

        expect(response.status).toBe(401)
    })

    it('answers the healthcheck without a user', async () => {
        const response = await fetch(`${base}/healthcheck`)

        expect(response.status).toBe(200)
    })
})

describe('credentials', () => {
    it.each([
        ['POST', '/attachments/data/access'],
        ['GET', '/attachments/data/credentials']
    ])('%s %s is not cacheable', async (method, path) => {
        const response = await fetch(base + path, {method, headers: {'sepal-user': USER}})

        expect(response.headers.get('cache-control')).toBe('no-store')
    })
})

describe('download', () => {
    it('redirects to the presigned link', async () => {
        download = async () => ({redirect: 'https://signed/x'})

        const response = await fetch(`${base}/attachments/data/download?path=data/x`, {headers: {'sepal-user': USER}, redirect: 'manual'})

        expect(response.status).toBe(302)
        expect(response.headers.get('location')).toBe('https://signed/x')
        expect(response.headers.get('cache-control')).toBe('no-store')
    })

    it('streams the file as an attachment', async () => {
        download = async () => ({stream: Readable.from(['hello']), size: 5, filename: 'b.txt', contentType: 'text/plain'})

        const response = await fetch(`${base}/attachments/data/download?path=data/b.txt`, {headers: {'sepal-user': USER}})

        expect(response.status).toBe(200)
        expect(response.headers.get('content-disposition')).toContain('attachment; filename="b.txt"')
        expect(response.headers.get('content-length')).toBe('5')
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(await response.text()).toBe('hello')
    })

    it('keeps quotes and line breaks out of the filename header', async () => {
        download = async () => ({stream: Readable.from(['x']), size: 1, filename: 'a"b\r\nc.txt'})

        const response = await fetch(`${base}/attachments/data/download?path=data/x`, {headers: {'sepal-user': USER}})

        expect(response.status).toBe(200)
        expect(response.headers.get('content-disposition')).toContain('filename="a_b__c.txt"')
    })

    it('streams a non-ASCII filename with the RFC 5987 header', async () => {
        download = async () => ({stream: Readable.from(['x']), size: 1, filename: '日本.txt'})

        const response = await fetch(`${base}/attachments/data/download?path=data/x`, {headers: {'sepal-user': USER}})

        expect(response.status).toBe(200)
        expect(response.headers.get('content-disposition')).toBe(
            'attachment; filename="__.txt"; filename*=UTF-8\'\'%E6%97%A5%E6%9C%AC.txt'
        )
    })

    it('answers 400 for an unsafe path', async () => {
        download = async () => {
            throw new ClientException('Invalid path')
        }

        const response = await fetch(`${base}/attachments/data/download?path=data/../x`, {headers: {'sepal-user': USER}})

        expect(response.status).toBe(400)
    })
})

describe('GET /attachments/data/files', () => {
    it('lists a folder inside Data', async () => {
        listing = {'a.tif': {file: true, size: 3, mtime: 5}}

        const response = await fetch(`${base}/attachments/data/files?path=exports/x`, {headers: {'sepal-user': USER}})

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({items: {'a.tif': {file: true, size: 3, mtime: 5}}})
        expect(listed).toEqual([['alice', 'data/exports/x']])
        expect(response.headers.get('cache-control')).toBe('no-store')
    })

    it('lists the Data root for an empty path', async () => {
        await fetch(`${base}/attachments/data/files?path=`, {headers: {'sepal-user': USER}})

        expect(listed).toEqual([['alice', 'data']])
    })

    it('answers 400 for a path that escapes', async () => {
        listThrows = new ClientException('Invalid path')

        const response = await fetch(`${base}/attachments/data/files?path=../x`, {headers: {'sepal-user': USER}})

        expect(response.status).toBe(400)
        expect(response.headers.get('cache-control')).toBe('no-store')
    })

    it('answers 404 for an unknown attachment', async () => {
        const response = await fetch(`${base}/attachments/dropbox/files?path=x`, {headers: {'sepal-user': USER}})

        expect(response.status).toBe(404)
        expect(listed).toEqual([])
    })
})

describe('POST /attachments/data/changed', () => {
    it('has the user\'s Data measured soon', async () => {
        const response = await fetch(`${base}/attachments/data/changed`, {method: 'POST', headers: {'sepal-user': USER}})

        expect(response.status).toBe(204)
        expect(measuredSoon).toEqual(['alice'])
    })

    it('answers 404 for an unknown attachment', async () => {
        const response = await fetch(`${base}/attachments/dropbox/changed`, {method: 'POST', headers: {'sepal-user': USER}})

        expect(response.status).toBe(404)
        expect(measuredSoon).toEqual([])
    })
})
