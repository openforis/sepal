const program = require('commander')
const fs = require('fs')
const log = require('sepal/log').getLogger()

const DEFAULT_PORT = 1026

program
    .option('--gee-email <value>')
    .option('--gee-key-path <value>')
    .option('--google-project-id <value>')
    .option('--sepal-host <value>')
    .option('--sepal-username <value>')
    .option('--sepal-password <value>')
    .option('--home-dir <value>')
    .option('--username <value>')
    .option('--port <number>', 'Port', DEFAULT_PORT)
    .parse(process.argv)

const {geeEmail, geeKeyPath, googleProjectId, sepalHost, sepalUsername, sepalPassword, homeDir, username, port} = program

const readFile = path => {
    try {
        return fs.readFileSync(path, {encoding: 'utf8'})
    } catch (error) {
        log.warn(`Cannot read GEE key: ${path}`)
        return null
    }
}

const geeKey = readFile(geeKeyPath)

const serviceAccountCredentials = {
    client_email: geeEmail,
    private_key: geeKey
}

log.info('Configuration loaded')

module.exports = {
    googleProjectId,
    serviceAccountCredentials,
    sepalHost,
    sepalUsername,
    sepalPassword,
    homeDir,
    username,
    port
}
