// Returns a map { <username>: Date } of the most recent CLOSED update_time per user.

const mostRecentlyClosedSessionByUser = async ({repo}) => repo.mostRecentlyClosedSessionByUser()

export {mostRecentlyClosedSessionByUser}
