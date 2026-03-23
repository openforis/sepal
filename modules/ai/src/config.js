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
        .option('--port <number>', 'Port', DEFAULT_PORT)
        .option('--sepal-endpoint <value>', 'SEPAL server endpoint', 'http://sepal')
        .option('--gee-endpoint <value>', 'GEE module endpoint', 'http://gee')
        .option('--llm-provider <value>', 'LLM provider (claude|openai|lmstudio)', 'claude')
        .option('--llm-api-key <value>', 'LLM API key')
        .option('--llm-model <value>', 'LLM model name')
        .option('--llm-base-url <value>', 'LLM base URL (for OpenAI-compatible providers, e.g. http://localhost:1234/v1)')
        .option('--rate-limit <number>', 'Max messages per minute per user', parseInt, 20)
        .option('--session-ttl-minutes <number>', 'Chat session TTL in minutes', parseInt, 30)
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    port,
    sepalEndpoint,
    geeEndpoint,
    llmProvider,
    llmApiKey,
    llmModel,
    llmBaseUrl,
    rateLimit,
    sessionTtlMinutes
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    port,
    sepalEndpoint,
    geeEndpoint,
    llmProvider,
    llmApiKey,
    llmModel,
    llmBaseUrl,
    rateLimit,
    sessionTtlMs: sessionTtlMinutes * 60 * 1000
}
