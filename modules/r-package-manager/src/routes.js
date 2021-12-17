const {getPackage} = require('./foo')

module.exports = router =>
    router
        .get('/', ctx => getPackage(ctx))
