const {Limiter$} = require('../limiter')

module.exports = Limiter$({
    name: 'EE',
    rateWindowMs: 1000,
    rateLimit: 10,
    concurrencyLimit: 20
})
