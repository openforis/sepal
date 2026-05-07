const WINDOW_MS = 60 * 1000

const createRateLimiter = ({limit}) => {
    const recentByUser = new Map()

    const check = username => {
        const now = Date.now()
        const recent = (recentByUser.get(username) || []).filter(t => now - t < WINDOW_MS)
        if (recent.length >= limit) {
            recentByUser.set(username, recent)
            return false
        } else {
            recent.push(now)
            recentByUser.set(username, recent)
            return true
        }
    }

    return {check}
}

module.exports = {createRateLimiter}
