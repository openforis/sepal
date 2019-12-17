const tokenService = require('../service/tokenService')

module.exports = tokenService({
    rateWindowMs: 1000,
    rateLimit: 10,
    concurrencyLimit: 20
})
