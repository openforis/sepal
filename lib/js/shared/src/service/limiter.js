const {Subject, finalize, mergeMap, takeUntil, switchMap, defer, of} = require('rxjs')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const {TokenLimiter$} = require('#sepal/limiter/tokenLimiter')
const service = require('#sepal/service')
const {tag} = require('#sepal/tag')
const log = require('#sepal/log').getLogger('limiter')

const limiterTag = (name, username) => tag('Limiter', name, username)

const LimiterService = (name, options) => {

    const globalLimiter$ = options.global
        ? TokenLimiter$({...options.global, name: `${name}:GLOBAL`})
        : null

    const userLimiters = {}

    const addLimiter = username => {
        const tokenLimiterOptions = {...options, name: `${name}:${username}`}
        const onDispose = () => removeLimiter(username)
        const limiter = TokenLimiter$(tokenLimiterOptions, onDispose)
        userLimiters[username] = limiter
        log.debug(() => `${limiterTag(name, username)} added`)
    }

    const removeLimiter = username => {
        delete userLimiters[username]
        log.debug(() => `${limiterTag(name, username)} removed`)
    }
    
    const getLimiter = username => {
        if (!userLimiters[username]) {
            addLimiter(username)
        }
        return userLimiters[username]
    }
    const limiterService = {
        serviceName: name,
        serviceHandler$: ({id, username}) => {
            const tokenLimiter$ = getLimiter(username)
            return tokenLimiter$(id).pipe(
                switchMap(value => globalLimiter$ ? globalLimiter$(id) : of(value))
            )
        }
    }

    return {
        limiterService,
        limiter$: (observable$, id = uuid(), username) =>
            defer(() => {
                const stop$ = new Subject()
                return service.submit$(limiterService, {id, username: username || 'ANON'}).pipe(
                    takeUntil(stop$),
                    mergeMap(() => observable$.pipe(
                        finalize(() => stop$.next())
                    ))
                )
            })
    }
}

module.exports = {LimiterService}
