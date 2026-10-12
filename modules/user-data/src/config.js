import {Command, Option} from 'commander'

import {getLogger} from '#sepal/log'

const log = getLogger('config')

const DEFAULT_HTTP_PORT = 80

const program = new Command()

program
    .addOption(new Option('--port <number>').env('HTTP_PORT').argParser(v => parseInt(v)).default(DEFAULT_HTTP_PORT))
    .addOption(new Option('--sepal-host <host>', 'Public host name of SEPAL').env('SEPAL_HOST').makeOptionMandatory())
    .addOption(new Option('--region <region>').env('AWS_REGION').makeOptionMandatory())
    .addOption(new Option('--bucket <name>').env('USER_DATA_BUCKET').makeOptionMandatory())
    .addOption(new Option('--access-key-id <id>').env('USER_DATA_AWS_ACCESS_KEY_ID').makeOptionMandatory())
    .addOption(new Option('--secret-access-key <key>').env('USER_DATA_AWS_SECRET_ACCESS_KEY').makeOptionMandatory())
    .addOption(new Option('--role-arn <arn>', 'Role user credentials are issued for').env('USER_DATA_ROLE_ARN'))
    .addOption(new Option('--s3-endpoint <url>', 'S3 endpoint of the dev-env emulator').env('USER_DATA_S3_ENDPOINT'))
    .addOption(new Option('--s3-emulator <boolean>', 'Use the dev-env emulator instead of AWS')
        .env('USER_DATA_S3_EMULATOR').argParser(value => value === 'true').default(false))
    .parse()

const options = program.opts()

// Without a role there is nothing to scope credentials with; emulator mode is the only setup that may lack one.
if (options.s3Emulator ? !options.s3Endpoint : !options.roleArn) {
    program.error(options.s3Emulator
        ? 'USER_DATA_S3_ENDPOINT is required in emulator mode'
        : 'USER_DATA_ROLE_ARN is required unless USER_DATA_S3_EMULATOR=true')
}

export const {port, sepalHost} = options

export const s3 = {
    region: options.region,
    bucket: options.bucket,
    roleArn: options.roleArn,
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    endpoint: options.s3Endpoint,
    emulator: options.s3Emulator
}

log.info(`Configuration loaded${s3.emulator ? ' (S3 emulator)' : ''}`)
