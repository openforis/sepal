const {mergeMap} = require('rxjs/operators')
const Pool = require('./pool')
const Limiter = require('./limiter')

module.exports = ({rateWindowMs, rateLimit, concurrencyLimit, create$, ...args}) => {
    const rateLimiter = Limiter({
        name: 'LimitedPool rate',
        rateWindowMs,
        rateLimit
    })
    const concurrencyLimiter = Limiter({
        name: 'LimitedPool concurrency',
        concurrencyLimit
    })
    const pool = Pool({...args, create$: instanceId => {
        return rateLimiter.next$().pipe(
            mergeMap(() => create$(instanceId))
        )
    }})
    return {
        getInstance$: () => concurrencyLimiter.next$().pipe(
            mergeMap(() => pool.getInstance$())
        )
    }
}
