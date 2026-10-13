// Returns {sessionId, username, workerType} or null; a closed session's key resolves until its release ends.

export const findSessionByApiKey = async (apiKey, {repo}) => repo.findSessionByApiKey(apiKey)
