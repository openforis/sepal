// Lowercases the username, then repo.mostRecentlyClosedSession → { timestamp: Date } or {}.

const mostRecentlyClosedSession = async (username, {repo}) => {
    const sanitizedUsername = username ? username.toLowerCase() : username
    return repo.mostRecentlyClosedSession(sanitizedUsername)
}

export {mostRecentlyClosedSession}
