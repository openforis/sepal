const job = require('./job')
const gee = require('./gee')

const workers = {
    preview: require('preview'),
    test: require('test')
}

module.exports = ctx => {
    return {
        preview: (...args) =>
            submit(ctx.req, 'preview', args)
    }
}
