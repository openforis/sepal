// Returns the username (lowercased) or null; PENDING/ACTIVE sessions only.

const findUsernameByApiKey = async (apiKey, {repo}) => repo.findUsernameByApiKey(apiKey)

export {findUsernameByApiKey}
