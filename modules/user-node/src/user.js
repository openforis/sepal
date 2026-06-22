// Maps a sepal_user DB row to an internal user object, and that object to the exact API JSON the
// Java `user` module produced (userToMap). Dates are emitted as ISO-8601 strings with +0000 suffix
// to match the Jackson/Java format: "2025-05-28T21:38:19+0000".

// Produces an ISO-8601 string matching Java's DateTimeFormatter output: no millis, "+0000" suffix.
const toISOStringJava = value => {
    if (value == null) return null
    const d = new Date(value)
    // toISOString() gives "2025-05-28T21:38:19.000Z"; strip millis and replace Z with +0000
    return d.toISOString().replace(/\.\d{3}Z$/, '+0000')
}

const toMillis = value =>
    value == null ? null : new Date(value).getTime()

const toGoogleTokens = row => {
    if (!row.google_refresh_token && !row.google_access_token) {
        return null
    }
    return {
        accessToken: row.google_access_token,
        accessTokenExpiryDate: toMillis(row.google_access_token_expiration),
        refreshToken: row.google_refresh_token,
        projectId: row.google_project_id,
        legacyProject: !!row.google_legacy_project
    }
}

// Internal user object — includes credential/token fields the API never returns but handlers need.
const rowToUser = row => {
    if (!row) {
        return null
    }
    const admin = !!row.admin
    return {
        id: row.id,
        name: row.name,
        username: row.username,
        email: row.email,
        organization: row.organization,
        intendedUse: row.intended_use,
        googleTokens: toGoogleTokens(row),
        emailNotificationsEnabled: !!row.email_notifications_enabled,
        manualMapRenderingEnabled: !!row.manual_map_rendering_enabled,
        privacyPolicyAccepted: !!row.privacy_policy_accepted,
        status: row.status,
        roles: admin ? ['application_admin'] : [],
        systemUser: !!row.system_user,
        admin,
        creationTime: toISOStringJava(row.creation_time),
        updateTime: toISOStringJava(row.update_time),
        lastLoginTime: toMillis(row.last_login_time),
        token: row.token,
        tokenGenerationTime: toMillis(row.token_generation_time),
        passwordHash: row.password_hash,
        sshPublicKey: row.ssh_public_key
    }
}

// The exact public API shape (matches Java UserEndpoint.userToMap).
const userToMap = (user, withGoogleTokens = true) => ({
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    organization: user.organization,
    intendedUse: user.intendedUse,
    googleUser: user.googleTokens != null,
    googleTokens: withGoogleTokens && user.googleTokens
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
    updateTime: user.updateTime,
    admin: user.admin
})

export {rowToUser, toISOStringJava, userToMap}
