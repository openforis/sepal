import {Command, Option} from 'commander'

import {getLogger} from '#sepal/log'
const log = getLogger('config')

const DEFAULT_HTTP_PORT = 80

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

const program = new Command()

try {
    program
        .exitOverride()
        .addOption(
            new Option('--ip <value>')
                .env('IP')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--home-dir <value>')
                .env('HOME_DIR')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--ssh-script-path <value>')
                .env('SSH_SCRIPT_PATH')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--port <number>')
                .env('HTTP_PORT')
                .argParser(v => parseInt(v))
                .default(DEFAULT_HTTP_PORT)
        )
        .parse()
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

export {
    homeDir,
    ip,
    port,
    sshScriptPath
}
