import {Command, Option} from 'commander'

import {getLogger} from '#sepal/log'

const log = getLogger('config')

const DEFAULT_HTTP_PORT = 80

const program = new Command()

program
    .addOption(
        new Option('--port <number>')
            .env('HTTP_PORT')
            .argParser(v => parseInt(v))
            .default(DEFAULT_HTTP_PORT)
    )
    .parse()

const {port} = program.opts()

log.info('Configuration loaded')

export {port}
