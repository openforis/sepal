const {Subject} = require('rxjs')
const {finalize, mergeMap, takeUntil} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const {TokenLimiter$} = require('sepal/limiter/tokenLimiter')
const service = require('sepal/service')
const {tag} = require('sepal/tag')
const log = require('sepal/log').getLogger('limiter')

const limiterTag = username => tag('Limiter', username)

const LimiterService = (name, options) => {
    const limiters = {}

    const addLimiter = username => {
        limiters[username] = TokenLimiter$({...options, name: `${name}:${username}`}, () => removeLimiter(username))
        log.debug(() => `${limiterTag(username)} added`)
    }

    const removeLimiter = username => {
        delete limiters[username]
        log.debug(() => `${limiterTag(username)} removed`)
    }
    
    const getLimiter = username => {
        if (!limiters[username]) {
            addLimiter(username)
        }
        return limiters[username]
    }

    const limiterService = {
        serviceName: name,
        serviceHandler$: ({id, username}) => {
            const limiter = getLimiter(username)
            return limiter(id)
        }
    }

    return {
        limiterService,
        limiter$: (observable$, id = uuid(), username) => {
            const stop$ = new Subject()
            return service.submit$(limiterService, {id, username}).pipe(
                takeUntil(stop$),
                mergeMap(() => observable$.pipe(
                    finalize(() => stop$.next())
                ))
            )
        }
    }
}

module.exports = {LimiterService}
