const {stream} = require('#sepal/httpServer')
const ws$ = require('./ws')
const {download} = require('./filesystem')
const {homeDir} = require('./config')

module.exports = router =>
    router
        .get('/ws', stream(ctx => ws$(ctx)))
        .get('/download', ctx => download(homeDir, ctx))
