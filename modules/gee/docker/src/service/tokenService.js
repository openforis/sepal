const Limiter = require('../limiter')

module.exports = ({name, rateWindowMs, rateLimit, concurrencyLimit}) => ({
    handle$: Limiter({name, rateWindowMs, rateLimit, concurrencyLimit}).next$
})
