const log = require('#sepal/log').getLogger('main')
const path = require('path')
const {exec$} = require('./terminal')

const EE_PRIVATE_KEY = process.env.EE_PRIVATE_KEY
const EE_ACCOUNT = process.env.EE_ACCOUNT
const PROJECT_ID = process.env.GOOGLE_PROJECT_ID
const EE_CLIENT_ID = process.env.EE_CLIENT_ID

const credentialsPath = path.join('/var/lib/sepal/app-launcher/service-account-credentials.json')

function get_ee_key() {
    // taken from gee module
    const geeKey = EE_PRIVATE_KEY
    if (!geeKey) {
        throw new Error('Environment variable EE_PRIVATE_KEY is not defined')
    }
    return geeKey.replace(/\\n/g, '\n')
}

// Main function to create the credentials JSON
function createCredentialsFile() {
    const credentials = {
        type: 'service_account',
        project_id: PROJECT_ID,
        client_email: EE_ACCOUNT,
        private_key: get_ee_key(),
        private_key_id: '',
        client_id: EE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token'
    }

    const credentialsJson = JSON.stringify(credentials, null, 2)

    const writeCredentials$ = (credentialsJson, credentialsPath) => {
        // Escape single quotes in JSON to prevent shell syntax errors
        const escapedJson = credentialsJson.replace(/'/g, '\'\\\'\'')
        // Use 'bash -c' to execute the command with shell features
        const command = 'sudo'
        const args = [
            'bash',
            '-c',
            `echo '${escapedJson}' > '${credentialsPath}'`,
        ]
    
        return exec$('/', command, args)
    }

    writeCredentials$(credentialsJson, credentialsPath).subscribe({
        next: output => {
            log.info('Credentials written successfully:', output)
        },
        error: err => {
            log.error('Error writing credentials:', err)
        },
        complete: () => {
            log.info('Write operation completed.')
        },
    })
    
}

module.exports = {
    createCredentialsFile
}
