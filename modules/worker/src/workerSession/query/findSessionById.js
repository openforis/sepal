// repo.getSession throws if the row is missing.

const findSessionById = async (sessionId, {repo}) => repo.getSession(sessionId)

export {findSessionById}
