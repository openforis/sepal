const {map, from} = require('rxjs')

const UserStore = redis => {

    if (!redis) {
        throw new Error('Cannot initialize UserStore due to missing argument: redis')
    }

    const userKey = username =>
        `user:${username}`

    const getUser = (username, callback) =>
        redis.get(userKey(username), callback)

    const getUser$ = username =>
        from(getUser(username))

    const setUser = (user, callback) =>
        redis.set(userKey(user.username), user, callback)

    const setUser$ = user =>
        from(setUser(user)).pipe(
            map(result => result === 'OK')
        )

    return {
        getUser, setUser, getUser$, setUser$
    }
}

module.exports = {UserStore}
