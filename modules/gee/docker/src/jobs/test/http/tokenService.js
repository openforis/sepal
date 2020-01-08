const tokenService = require('../../service/tokenService')

module.exports = tokenService({
    name: 'Test',
    rateLimit: 5,
    concurrencyLimit: 5
})
