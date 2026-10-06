import {DEFAULT_EE_ENDPOINT} from '#sepal/ee/eeContext'
import {tag} from '#sepal/tag'

// A request's Earth Engine calls are made as its user when they have a Google account, otherwise as the SEPAL
// service account; in the account's own project when it names one, otherwise in the SEPAL project.
export const createEEContext = ({
    requestId,
    credentials: {sepalUser, sepalSession, googleProjectId} = {},
    jobName,
    workloadTag,
    endpoint = DEFAULT_EE_ENDPOINT,
    now = Date.now()
}) => {
    const username = sepalUser?.username ?? null
    const googleTokens = sepalUser?.googleTokens
    if (googleTokens) {
        validateGoogleTokens(googleTokens, username, now)
    }
    return {
        requestId,
        username,
        origin: originOf(sepalSession),
        auth: googleTokens
            ? {type: 'user', accessToken: googleTokens.accessToken, expiresAt: googleTokens.accessTokenExpiryDate}
            : {type: 'serviceAccount'},
        projectId: googleTokens?.projectId || googleProjectId,
        workloadTag: workloadTag || workloadTagOf(jobName),
        endpoint
    }
}

// Only the gateway sets sepal-session, from the API key the request was authenticated with.
const originOf = sepalSession =>
    sepalSession?.workerType === 'task' ? 'task' : 'interactive'

const workloadTagOf = jobName =>
    `sepal-work-${jobName.toLowerCase().replace(/[^a-z0-9_-]/g, '_').substring(0, 63)}`

const validateGoogleTokens = ({accessToken, accessTokenExpiryDate}, username, now) => {
    if (!accessToken) {
        throw Error(`${userTag(username)} Access token is missing`)
    }
    const secondsToExpiration = (accessTokenExpiryDate - now) / 1000
    if (secondsToExpiration <= 0) {
        throw Error(`${userTag(username)} Token expired ${secondsToExpiration} seconds ago`)
    }
}

const userTag = username => tag('User', username || 'ANON')
