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
        projectId: eeProjectId(sepalUser, googleProjectId),
        workloadTag: workloadTag || workloadTagOf(jobName),
        endpoint
    }
}

// The account a request's calls are made as, Google (GA) or service (SA), and the project they go to.
export const eeAccountTag = (sepalUser, googleProjectId) =>
    `<${sepalUser?.googleTokens ? 'GA' : 'SA'}:${eeProjectId(sepalUser, googleProjectId)}>`

const eeProjectId = (sepalUser, googleProjectId) =>
    sepalUser?.googleTokens?.projectId || googleProjectId

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
