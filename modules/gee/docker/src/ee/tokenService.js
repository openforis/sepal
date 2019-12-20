const tokenService = require('../service/tokenService')

module.exports = tokenService({
    name: 'EE',
    rateWindowMs: 1000,
    rateLimit: 10,
    concurrencyLimit: 20
})
