// Returns the username or null; PENDING/ACTIVE sessions only.

const findUsernameByApiKey = async (apiKey, {repo}) => repo.findUsernameByApiKey(apiKey)

export {findUsernameByApiKey}
