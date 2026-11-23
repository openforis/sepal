import {createWriteStream} from 'node:fs'
import {unlink} from 'node:fs/promises'
import {Writable} from 'node:stream'

import koaBody from 'koa-body'

import {getLogger} from '#sepal/log'

const log = getLogger('upload')

const MAX_FILE_SIZE = 100 * 1024 * 1024

// Parses a multipart request for the handlers after it, and owns the temporary files the parser writes for it. Once
// the request is done, however it ends, each is closed and removed: files under any name, and files received only in
// part when parsing failed or the client went away, which handlers never see.
export const upload = async (ctx, next) => {
    const temporaryFiles = new TemporaryFiles(ctx.requestTag)
    try {
        await koaBody(multipartOptions(temporaryFiles))(ctx, next)
    } finally {
        await temporaryFiles.discard()
    }
}

const multipartOptions = temporaryFiles => ({
    multipart: true,
    formidable: {
        maxFileSize: MAX_FILE_SIZE,
        fileWriteStreamHandler: file => temporaryFiles.writer(file)
    }
})

// The files the parser writes for one request. The parser names each and leaves its writer to us, so that a file is
// removed only once its writer has closed: removing one still opening would leave the file the opening creates.
// Having failed, the parser still reads on through the parts it already holds; once the files are discarded, any
// further part is read into nothing.
class TemporaryFiles {
    #requestTag
    #files = []
    #discarded = false

    constructor(requestTag) {
        this.#requestTag = requestTag
    }

    writer({filepath}) {
        if (this.#discarded) {
            return nowhere()
        }
        const writer = createWriteStream(filepath)
        this.#files.push({filepath, writer})
        return writer
    }

    // Never fails: a file that cannot be removed is logged, and the request ends as it would have.
    async discard() {
        this.#discarded = true
        await Promise.all(this.#files.map(file => this.#remove(file)))
    }

    async #remove({filepath, writer}) {
        await closed(writer)
        try {
            await unlink(filepath)
        } catch (error) {
            if (error.code !== 'ENOENT') {
                log.warn(`${this.#requestTag} Cannot remove temporary upload: ${filepath} (${error.code})`)
            }
        }
    }
}

const closed = writer =>
    writer.closed
        ? Promise.resolve()
        : new Promise(resolve => {
            writer.once('close', resolve)
            writer.destroy()
        })

const nowhere = () =>
    new Writable({write: (_chunk, _encoding, callback) => callback()})
