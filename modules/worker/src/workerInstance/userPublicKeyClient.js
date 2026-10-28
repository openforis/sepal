// UserPublicKeyClient — createUserPublicKeyClient(config) → { publicKey(username) }.
//
// publicKey GETs `${userUrl}/sandbox-public-key?username={username}` (default base `http://user`)
// and returns the public half of the keypair the user module generated for the user, which the
// sandbox authorizes for ssh. The worker cannot read the key file: it is readable by the user only.
//
// Auth: the worker has no user context here, so it impersonates an admin via the gateway-style
// `sepal-user` header — the user module's requireAdmin guard expects the application_admin role.
//
// Errors (non-2xx, including a user without a key, and transport) are THROWN: a sandbox started
// without the key would refuse every ssh login.

const ADMIN_ROLE = 'application_admin'
const DEFAULT_USER_URL = 'http://user'
const DEFAULT_ADMIN_USERNAME = 'sepaladmin'

const createUserPublicKeyClient = config => {
    const baseUrl = (config.userUrl || DEFAULT_USER_URL).replace(/\/+$/, '')
    const adminUsername = config.sepalUser || DEFAULT_ADMIN_USERNAME
    const sepalUser = JSON.stringify({username: adminUsername, roles: [ADMIN_ROLE], systemUser: true})

    const publicKey = async username => {
        const url = `${baseUrl}/sandbox-public-key?username=${encodeURIComponent(username)}`
        const response = await fetch(url, {headers: {'sepal-user': sepalUser}})
        if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(`Failed to get the SSH public key of ${username}: ${response.status} ${text}`)
        }
        return response.text()
    }

    return {publicKey}
}

export {createUserPublicKeyClient}
