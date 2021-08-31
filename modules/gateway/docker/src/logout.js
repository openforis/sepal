const log = require('sepal/log').getLogger('auth')

const logout = async (req, res, _next) => {
    const user = req.session.user
    req.session.destroy()
    if (user) {
        log.debug(`[${user.username}] Logout`)
    }
    const cookieHeader = req.get('Cookie')
    if (cookieHeader) {
        cookieHeader
            .split(';')
            .map(cookie => cookie
                .split('=')[0]
                .trim()
            )
            .forEach(cookie => res.cookie(cookie, '', {maxAge: 0}))
    }

    res.end()
}

module.exports = {logout}
