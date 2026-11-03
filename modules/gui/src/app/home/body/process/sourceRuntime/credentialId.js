// Credential tokens are opaque and equal by value, so what is shared between requests names them by identity.
const CREDENTIAL_IDS = new WeakMap()
let credentialIds = 0

export const credentialId = token => {
    if (!token || typeof token !== 'object') {
        return 0
    }
    if (!CREDENTIAL_IDS.has(token)) {
        CREDENTIAL_IDS.set(token, ++credentialIds)
    }
    return CREDENTIAL_IDS.get(token)
}
