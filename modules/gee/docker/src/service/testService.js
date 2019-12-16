const tokenService = require('./tokenService')

module.exports = tokenService({
    rateLimit: 1,
    concurrencyLimit: 2
})
