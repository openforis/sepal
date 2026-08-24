import {Subject} from 'rxjs'

// The RabbitMQ payload shape — matches the Java User.toMap() (NOT the endpoint userToMap):
// no googleUser, no admin, and googleTokens has only 4 fields (no legacyProject).
const userToEventMap = user => ({
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    organization: user.organization,
    intendedUse: user.intendedUse,
    googleTokens: user.googleTokens
        ? {
            accessToken: user.googleTokens.accessToken,
            accessTokenExpiryDate: user.googleTokens.accessTokenExpiryDate,
            refreshToken: user.googleTokens.refreshToken,
            projectId: user.googleTokens.projectId
        }
        : null,
    emailNotificationsEnabled: user.emailNotificationsEnabled,
    manualMapRenderingEnabled: user.manualMapRenderingEnabled,
    privacyPolicyAccepted: user.privacyPolicyAccepted,
    status: user.status,
    roles: user.roles,
    systemUser: user.systemUser,
    creationTime: user.creationTime,
    updateTime: user.updateTime
})

// Publishers wired into initMessageQueue (main.js): each Subject's emissions are published to
// the matching routing key on the sepal.topic exchange.
const userUpdated$ = new Subject()
const userLocked$ = new Subject()

const publishUserUpdated = user => userUpdated$.next(userToEventMap(user))
const publishUserLocked = user => userLocked$.next(userToEventMap(user))

export {publishUserLocked, publishUserUpdated, userLocked$, userToEventMap, userUpdated$}
