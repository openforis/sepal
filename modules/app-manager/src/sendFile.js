import fs from 'node:fs'
import {stat} from 'node:fs/promises'
import {resolve, sep} from 'node:path'

import mime from 'mime-types'
import moment from 'moment'

import {NotFoundException} from '#sepal/exception'

const sendFile = (ctx, root, filename) => {
    const path = resolveFile(root, filename)
    return path
        ? sendExistingFile(ctx, path)
        : Promise.reject(new NotFoundException(`File not found: ${filename}`))
}

export const resolveFile = (root, filename) => {
    const path = resolve(root, filename)
    return path.startsWith(`${resolve(root)}${sep}`) ? path : null
}

const sendExistingFile = (ctx, path) =>
    stat(path)
        .then(stats => {
            const ifModifiedSince = ctx.get('If-Modified-Since')
            const lastModified = stats.mtime
            ctx.set('Last-Modified', lastModified.toUTCString())
            ctx.set('Cache-Control', 'max-age=10, must-revalidate')
            if (ifModifiedSince && moment(ifModifiedSince).isSameOrAfter(moment(lastModified))) {
                ctx.response.status = 304
            } else {
                ctx.response.set('content-type', mime.lookup(path) || 'application/octet-stream')
                ctx.body = fs.createReadStream(path)
            }
        })
        .catch(error => {
            throw new NotFoundException(`File not found: ${path}`, {cause: error})
        })

const sendFileNoCache = (ctx, path) => {
    ctx.response.set('content-type', mime.lookup(path))
    ctx.body = fs.createReadStream(path)
}

export {sendFile, sendFileNoCache}
