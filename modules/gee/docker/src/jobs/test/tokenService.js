const tokenService = require('../../service/tokenService')

module.exports = tokenService({
    rateLimit: 5,
    concurrencyLimit: 5
})
