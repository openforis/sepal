const {program} = require('commander')
const log = require('#sepal/log').getLogger('config')

const DEFAULT_PORT = 80

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--ip <value>', 'IP address')
        .option('--port <number>', 'Port', DEFAULT_PORT)
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
