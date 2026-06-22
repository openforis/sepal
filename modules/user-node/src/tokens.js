import {v4 as uuidv4} from 'uuid'

// Tokens expire after 1 day, matching the Java TokenStatus.MAX_AGE_DAYS.
const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000

const generateToken = () => uuidv4()

// generationTimeMs is epoch milliseconds (as exposed by rowToUser.tokenGenerationTime); a missing
// value counts as expired.
const isExpired = (generationTimeMs, nowMs = Date.now()) =>
    generationTimeMs == null || (nowMs - generationTimeMs) > TOKEN_MAX_AGE_MS

// Reuse the user's current token if it exists and has not expired; otherwise mint a new one.
// Mirrors Java TokenManager.getOrGenerateToken. `user` carries `token` and `tokenGenerationTime`
// (epoch ms, as exposed by rowToUser).
const getOrGenerateToken = (user, nowMs = Date.now()) =>
    user.token && !isExpired(user.tokenGenerationTime, nowMs) ? user.token : generateToken()

export {generateToken, getOrGenerateToken, isExpired, TOKEN_MAX_AGE_MS}
