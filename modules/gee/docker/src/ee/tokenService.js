const tokenService = require('../service/tokenService')

module.exports = tokenService({
    rateLimit: 100,
    concurrencyLimit: 100
})
