import {Command, Option} from 'commander'
import _ from 'lodash'

import {getLogger} from '#sepal/log'

const log = getLogger('config')

const DEFAULT_HTTP_PORT = 80
const DEFAULT_INSTANCES = 3
const DEFAULT_RECIPE_ENDPOINT = 'http://recipe'
const DEFAULT_EE_LIMITS = {
    user: {maxRate: 25, maxConcurrency: 10},
    project: {maxRate: 100, maxConcurrency: 40},
    global: {maxRate: 200, maxConcurrency: 100}
}

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

const limitOption = (flag, env, defaultValue) => {
    const option = new Option(`${flag} <number>`)
        .env(env)
        .argParser(v => parseInt(v))
    return defaultValue === undefined
        ? option
        : option.default(defaultValue)
}

const program = new Command()

try {
    program
        .exitOverride()
        .addOption(
            new Option('--sepal-endpoint <value>')
                .env('SEPAL_ENDPOINT')
                .makeOptionMandatory()
        )
        // The Recipe module itself rather than the gateway: the gateway strips inbound identity
        // headers, so a read through it could not act as the user whose request this is.
        .addOption(
            new Option('--recipe-endpoint <value>')
                .env('RECIPE_ENDPOINT')
                .default(DEFAULT_RECIPE_ENDPOINT)
        )
        .addOption(
            new Option('--google-project-id <value>')
                .env('GOOGLE_PROJECT_ID')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--gee-email <value>')
                .env('EE_ACCOUNT')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--gee-key <value>')
                .env('EE_PRIVATE_KEY')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--port <number>')
                .env('HTTP_PORT')
                .argParser(v => parseInt(v))
                .default(DEFAULT_HTTP_PORT)
        )
        .addOption(
            new Option('--instances <number>')
                .env('INSTANCES')
                .argParser(v => parseInt(v))
                .default(DEFAULT_INSTANCES)
        )
        .addOption(limitOption('--ee-limit-user-rate', 'EE_LIMIT_USER_RATE', DEFAULT_EE_LIMITS.user.maxRate))
        .addOption(limitOption('--ee-limit-user-concurrency', 'EE_LIMIT_USER_CONCURRENCY', DEFAULT_EE_LIMITS.user.maxConcurrency))
        .addOption(limitOption('--ee-limit-project-rate', 'EE_LIMIT_PROJECT_RATE', DEFAULT_EE_LIMITS.project.maxRate))
        .addOption(limitOption('--ee-limit-project-concurrency', 'EE_LIMIT_PROJECT_CONCURRENCY', DEFAULT_EE_LIMITS.project.maxConcurrency))
        .addOption(limitOption('--ee-limit-sepal-project-rate', 'EE_LIMIT_SEPAL_PROJECT_RATE'))
        .addOption(limitOption('--ee-limit-sepal-project-concurrency', 'EE_LIMIT_SEPAL_PROJECT_CONCURRENCY'))
        .addOption(limitOption('--ee-limit-global-rate', 'EE_LIMIT_GLOBAL_RATE', DEFAULT_EE_LIMITS.global.maxRate))
        .addOption(limitOption('--ee-limit-global-concurrency', 'EE_LIMIT_GLOBAL_CONCURRENCY', DEFAULT_EE_LIMITS.global.maxConcurrency))
        .parse()
} catch (error) {
    fatalError(error)
}

const {geeEmail,
    sepalEndpoint,
    recipeEndpoint,
    geeKey,
    googleProjectId,
    port,
    instances,
    eeLimitUserRate,
    eeLimitUserConcurrency,
    eeLimitProjectRate,
    eeLimitProjectConcurrency,
    eeLimitSepalProjectRate,
    eeLimitSepalProjectConcurrency,
    eeLimitGlobalRate,
    eeLimitGlobalConcurrency
} = program.opts()

const serviceAccountCredentials = {
    client_email: geeEmail,
    private_key: _.replace(geeKey, /\\n/g, '\n')
}

// The SEPAL project carries every service-account call and every user without a project of their own; it takes
// the common project limits unless told otherwise.
const eeLimits = {
    user: {maxRate: eeLimitUserRate, maxConcurrency: eeLimitUserConcurrency},
    project: {maxRate: eeLimitProjectRate, maxConcurrency: eeLimitProjectConcurrency},
    sepalProject: {
        maxRate: eeLimitSepalProjectRate ?? eeLimitProjectRate,
        maxConcurrency: eeLimitSepalProjectConcurrency ?? eeLimitProjectConcurrency
    },
    global: {maxRate: eeLimitGlobalRate, maxConcurrency: eeLimitGlobalConcurrency}
}

log.info('Configuration loaded')

export {
    eeLimits,
    googleProjectId,
    instances,
    port,
    recipeEndpoint,
    sepalEndpoint,
    serviceAccountCredentials}
