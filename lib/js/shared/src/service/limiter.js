const {Subject, finalize, mergeMap, takeUntil} = require('rxjs')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const {TokenLimiter$} = require('#sepal/limiter/tokenLimiter')
const service = require('#sepal/service')
const {tag} = require('#sepal/tag')
const log = require('#sepal/log').getLogger('limiter')

const limiterTag = (name, username) => tag('Limiter', name, username)

const LimiterService = (name, options) => {
    const limiters = {}

    const addLimiter = username => {
        const tokenLimiterOptions = {...options, name: `${name}:${username}`}
        const onDispose = () => removeLimiter(username)
        const limiter = TokenLimiter$(tokenLimiterOptions, onDispose)
        limiters[username] = limiter
        log.debug(() => `${limiterTag(name, username)} added`)
    }

    const removeLimiter = username => {
        delete limiters[username]
        log.debug(() => `${limiterTag(name, username)} removed`)
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
            const tokenLimiter$ = getLimiter(username)
            return tokenLimiter$(id)
        }
    }

    return {
        limiterService,
        limiter$: (observable$, id = uuid(), username) => {
            const stop$ = new Subject()
            return service.submit$(limiterService, {id, username: username || 'ANON'}).pipe(
                takeUntil(stop$),
                mergeMap(() => observable$.pipe(
                    finalize(() => stop$.next())
                ))
            )
        }
    }
}

module.exports = {LimiterService}
