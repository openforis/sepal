import {execFile} from 'child_process'

const SAVE = '/usr/local/bin/save-credentials'
const DELETE = '/usr/local/bin/delete-credentials'

// Build the Earth Engine credentials file payload (matches the Java gateway JSON).
const credentialsJson = tokens => JSON.stringify({
    access_token: tokens.accessToken,
    access_token_expiry_date: tokens.accessTokenExpiryDate,
    project_id: tokens.projectId ?? null
})

const createCredentials = (exec = execFile) => ({
    // Save (or, if tokens is null, delete) the user's EE credentials file.
    saveCredentials: (username, tokens) => new Promise((resolve, reject) => {
        if (!tokens) {
            return resolve(deleteCredentialsWith(exec, username))
        }
        const child = exec('sudo', [SAVE, username], err => err ? reject(err) : resolve())
        child.stdin.end(credentialsJson(tokens))
    }),
    deleteCredentials: username => deleteCredentialsWith(exec, username)
})

const deleteCredentialsWith = (exec, username) => new Promise((resolve, reject) => {
    exec('sudo', [DELETE, username], err => err ? reject(err) : resolve())
})

const {saveCredentials, deleteCredentials} = createCredentials()

export {createCredentials, credentialsJson, deleteCredentials, saveCredentials}
