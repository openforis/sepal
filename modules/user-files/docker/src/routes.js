const {stream} = require('sepal/httpServer')
const ws$ = require('./ws')

module.exports = router =>
    router
        .get('/ws/:username', stream(ctx => ws$(ctx)))
