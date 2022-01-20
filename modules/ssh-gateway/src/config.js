const program = require('commander')
const fs = require('fs')
const log = require('sepal/log').getLogger('config')
const _ = require('lodash')

program
    .option('--non-interactive')
    .option('--username <value>')
    .option('--user-key-file <value>')
    .option('--endpoint <value>')
    .option('--endpoint-password <value>')
    .option('--ssh-command-path <value>')
    .parse(process.argv)

const {
    interactive,
    nonInteractive,
    username,
    userKeyFile,
    endpoint,
    endpointPassword,
    sshCommandPath
} = program.opts()

module.exports = {
    interactive,
    username,
    userKeyFile,
    endpoint,
    endpointPassword,
    sshCommandPath
}
