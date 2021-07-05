const program = require('commander')
const log = require('sepal/log').getLogger('config')

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--ip <value>', 'IP address')
        .requiredOption('--port <number>', 'Port', parseInt)
        .requiredOption('--home-dir <value>', 'Base directory of user homes')
        .requiredOption('--ssh-script-path <value>', 'SSH script path')
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    ip,
    port,
    homeDir,
    sshScriptPath
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    ip,
    port,
    homeDir,
    sshScriptPath
}

// module.exports = {
//     PORT: process.env.PORT || 3000,
//     HOST: process.env.IP || '127.0.0.1',
//     USERS_HOME: process.env.USERS_HOME || '/sepalUsers',
//     SSH_SCRIPT_PATH: process.env.SSH_SCRIPT_PATH ||'ssh_gateway.sh'
// }
