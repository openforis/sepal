const {getPackage} = require('./package')

module.exports = router =>
    router
        .get('/src/contrib/:name', ctx => getPackage(ctx))
