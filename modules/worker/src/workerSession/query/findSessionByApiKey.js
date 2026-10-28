// Returns {sessionId, username, workerType} or null; PENDING/ACTIVE sessions only.

export const findSessionByApiKey = async (apiKey, {repo}) => repo.findSessionByApiKey(apiKey)
