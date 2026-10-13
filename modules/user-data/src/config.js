import {Command, Option} from 'commander'

import {getLogger} from '#sepal/log'

import {dataBucketName} from './providers/s3.js'

const log = getLogger('config')

const DEFAULT_HTTP_PORT = 80

const program = new Command()

const mandatory = (flags, envName, description) => new Option(flags, description)
    .env(envName)
    .argParser(value => {
        if (!value.trim()) {
            program.error(`${envName} must not be empty`)
        }
        return value
    })
    .makeOptionMandatory()

program
    .addOption(new Option('--port <number>').env('HTTP_PORT').argParser(v => parseInt(v)).default(DEFAULT_HTTP_PORT))
    .addOption(mandatory('--sepal-host <host>', 'SEPAL_HOST', 'Public host name of SEPAL'))
    .addOption(mandatory('--rabbitmq-host <host>', 'RABBITMQ_HOST'))
    .addOption(new Option('--rabbitmq-port <port>').env('RABBITMQ_PORT').argParser(v => parseInt(v)).default(5672))
    .addOption(mandatory('--region <region>', 'AWS_REGION'))
    .addOption(mandatory('--access-key-id <id>', 'AWS_ACCESS_KEY_ID'))
    .addOption(mandatory('--secret-access-key <key>', 'AWS_SECRET_ACCESS_KEY'))
    .addOption(mandatory('--deploy-environment <name>', 'DEPLOY_ENVIRONMENT'))
    .addOption(new Option('--s3-endpoint <url>', 'S3 endpoint of the dev-env emulator').env('USER_DATA_S3_ENDPOINT'))
    .addOption(new Option('--s3-emulator <boolean>', 'Use the dev-env emulator instead of AWS')
        .env('USER_DATA_S3_EMULATOR').argParser(value => value === 'true').default(false))
    .parse()

const options = program.opts()

if (options.s3Emulator && !options.s3Endpoint?.trim()) {
    program.error('USER_DATA_S3_ENDPOINT is required in emulator mode')
}

export const {port, sepalHost} = options

export const amqpUri = `amqp://${options.rabbitmqHost}:${options.rabbitmqPort}`

export const s3 = {
    region: options.region,
    deployEnvironment: options.deployEnvironment,
    bucket: dataBucketName(options.deployEnvironment),
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    endpoint: options.s3Endpoint,
    emulator: options.s3Emulator
}

log.info(`Configuration loaded${s3.emulator ? ' (S3 emulator)' : ''}`)
