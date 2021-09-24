const {stream} = require('sepal/httpServer')
const ws$ = require('./ws')

module.exports = router =>
    router
        .get('/ws', stream(ctx => ws$(ctx)))
