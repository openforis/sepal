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
            new Option('--port <number>')
                .env('HTTP_PORT')
                .argParser(v => parseInt(v))
                .default(DEFAULT_HTTP_PORT)
        )
        .addOption(
            new Option('--amqp-host <value>')
                .env('RABBITMQ_HOST')
                .makeOptionMandatory()
        )
        .addOption(new Option('--google-project-id <value>').env('GOOGLE_PROJECT_ID').default(''))
        .addOption(new Option('--google-oauth-client-id <value>').env('GOOGLE_OAUTH_CLIENT_ID').default(''))
        .addOption(new Option('--google-oauth-client-secret <value>').env('GOOGLE_OAUTH_CLIENT_SECRET').default(''))
        .addOption(new Option('--google-oauth-callback-base-url <value>').env('GOOGLE_OAUTH_CALLBACK_BASE_URL').default(''))
        .addOption(new Option('--recaptcha-api-key <value>').env('GOOGLE_RECAPTCHA_ENTERPRISE_API_KEY').default(''))
        .addOption(new Option('--recaptcha-site-key <value>').env('GOOGLE_RECAPTCHA_ENTERPRISE_SITE_KEY').default(''))
        .addOption(new Option('--recaptcha-min-score <number>').env('GOOGLE_RECAPTCHA_ENTERPRISE_MIN_SCORE').argParser(v => parseFloat(v)).default(0.7))
        .addOption(new Option('--recaptcha-optional <value>').env('RECAPTCHA_OPTIONAL').default('false'))
        .addOption(new Option('--sepal-host <value>').env('SEPAL_HOST').default(''))
        .parse()
} catch (error) {
    fatalError(error)
}

const {
    port, amqpHost, googleProjectId, googleOauthClientId, googleOauthClientSecret, googleOauthCallbackBaseUrl,
    recaptchaApiKey, recaptchaSiteKey, recaptchaMinScore,
    recaptchaOptional: recaptchaOptionalRaw, sepalHost
} = program.opts()

log.info('Configuration loaded')

const amqpUri = `amqp://${amqpHost}`
const recaptchaOptional = recaptchaOptionalRaw === 'true' || recaptchaOptionalRaw === true

export {
    amqpUri, googleOauthCallbackBaseUrl, googleOauthClientId, googleOauthClientSecret,
    googleProjectId, port, recaptchaApiKey, recaptchaMinScore, recaptchaOptional,
    recaptchaSiteKey, sepalHost
}
