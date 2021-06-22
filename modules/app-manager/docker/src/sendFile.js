const mime = require('mime-types')
const fs = require('fs')
const {stat} = require('fs/promises')

const sendFile = (ctx, path) =>
    stat(path)
        .then(stats => {
            const ifModifiedSince = ctx.get('If-Modified-Since')
            const lastModified = stats.mtime
            ctx.set('Last-Modified', lastModified.toUTCString())
            ctx.set('Cache-Control', 'max-age=10, must-revalidate')
            if (ifModifiedSince && new Date(ifModifiedSince) <= lastModified) {
                ctx.response.status = 304
            } else {
                ctx.response.set('content-type', mime.lookup(path))
                ctx.body = fs.createReadStream(path)
            }
        })
        .catch(_e => {
            ctx.throw(404)
        })
module.exports = {sendFile}
