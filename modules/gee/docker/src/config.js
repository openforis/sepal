const program = require('commander')
const fs = require('fs')
const log = require('@sepal/log')

const DEFAULT_PORT = 5001

program
    .option('--gee-email <value>')
    .option('--gee-key-path <value>')
    .option('--sepal-host <value>')
    .option('--sepal-username <value>')
    .option('--sepal-password <value>')
    .option('--home-dir <value>')
    .option('--username <value>')
    .option('--port <number>', 'Port', DEFAULT_PORT)
    .parse(process.argv)

const {geeEmail, geeKeyPath, sepalHost, sepalUsername, sepalPassword, homeDir, username, port} = program

const geeKey = fs.readFileSync(geeKeyPath, {encoding: 'utf8'})

const serviceAccountCredentials = {
    client_email: geeEmail,
    private_key: geeKey
}

log.info('Configuration loaded')

module.exports = {
    serviceAccountCredentials,
    sepalHost,
    sepalUsername,
    sepalPassword,
    homeDir,
    username,
    port
}
