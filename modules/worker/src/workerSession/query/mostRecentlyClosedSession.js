// repo.mostRecentlyClosedSession → { timestamp: Date } or {}. The username is passed through
// as given: the column is ascii_general_ci, so the lookup matches whatever case it receives.

const mostRecentlyClosedSession = async (username, {repo}) => repo.mostRecentlyClosedSession(username)

export {mostRecentlyClosedSession}
