const {program} = require('commander')
const _ = require('lodash')

program
    .option('--interactive')
    .option('--non-interactive')
    .option('--username <value>')
    .option('--user-key-file <value>')
    .option('--endpoint <value>')
    .option('--endpoint-password <value>')
    .option('--ssh-command-path <value>')
    .parse(process.argv)

const {
    interactive,
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
