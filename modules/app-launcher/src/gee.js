const fs = require('fs').promises
const log = require('#sepal/log').getLogger('main')
const path = require('path')
const {geeEmail, geeKey, googleProjectId, geeClientId} = require('./config')

const credentialsPath = path.join('/var/lib/sepal/app-launcher/service-account-credentials.json')

const get_ee_key = () => geeKey.replace(/\\n/g, '\n')

// Main function to create the credentials JSON
function createCredentialsFile() {
    const credentials = {
        type: 'service_account',
        project_id: googleProjectId,
        client_email: geeEmail,
        private_key: get_ee_key(),
        private_key_id: '',
        client_id: geeClientId,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token'
    }

    const credentialsJson = JSON.stringify(credentials, null, 2)

    const writeCredentials = async (credentialsJson, credentialsPath) => {
        try {
            await fs.writeFile(credentialsPath, credentialsJson, 'utf8')
            log.info('Credentials written successfully')
        } catch (err) {
            log.error('Error writing credentials:', err)
        }
    }

    writeCredentials(credentialsJson, credentialsPath)
    
}

module.exports = {
    createCredentialsFile
}
