const {Limiter$} = require('../../limiter')

module.exports = Limiter$({
    name: 'Test',
    rateLimit: 5,
    concurrencyLimit: 5
})
