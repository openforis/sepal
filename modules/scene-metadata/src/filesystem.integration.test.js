import assert from 'node:assert/strict'
import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {after, afterEach, before, beforeEach, describe, test} from 'node:test'
import {gzipSync} from 'node:zlib'

import {configureNoLogging} from '#sepal/log'

import {download} from './filesystem.js'

describe('CSV downloads', () => {
    let server
    let directory
    let respond
    let url
    const filesDirectory = process.env.MYSQL_FILES_DIR

    before(async () => {
        configureNoLogging()
        server = createServer((_request, response) => respond(response))
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
        url = `http://127.0.0.1:${server.address().port}/metadata.csv.gz`
    })

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'scene-download-'))
        process.env.MYSQL_FILES_DIR = directory
    })

    afterEach(async () => {
        process.env.MYSQL_FILES_DIR = filesDirectory
        await rm(directory, {recursive: true, force: true})
    })

    after(() => new Promise(resolve => server.close(resolve)))

    test('makes the complete downloaded archive available for parsing', async () => {
        const archive = gzipSync('id\nscene\n')
        respond = response => response.end(archive)

        await download({url, collection: 'tiny'})

        const stored = await readFile(join(directory, 'tiny.csv.gz'))
        const files = await readdir(directory)
        assert.deepEqual(stored, archive)
        assert.deepEqual(files, ['tiny.csv.gz'])
    })

    test('rejects a broken response body and preserves the previous complete archive', async () => {
        const previous = gzipSync('id\nprevious\n')
        await writeFile(join(directory, 'tiny.csv.gz'), previous)
        respond = response => {
            response.writeHead(200, {'Content-Length': 100, Connection: 'close'})
            response.end('partial')
        }

        await assert.rejects(download({url, collection: 'tiny'}))

        const stored = await readFile(join(directory, 'tiny.csv.gz'))
        assert.deepEqual(stored, previous)
    })
})
