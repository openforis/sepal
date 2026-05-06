const {Command, Option} = require('commander')
const log = require('#sepal/log').getLogger('config')

const DEFAULT_PORT = 80

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

const DEFAULT_HTTP_PORT = 80

const program = new Command()

try {
    program
        .addOption(
            new Option('--sepal-endpoint <value>')
                .env('SEPAL_ENDPOINT')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--gee-endpoint <value>')
                .env('GEE_ENDPOINT')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--llm-provider <value>')
                .env('LLM_PROVIDER')
                .choices(['claude', 'openai', 'lmstudio'])
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--llm-api-key <value>', 'LLM API key')
                .env('LLM_API_KEY')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--llm-model <value>', 'LLM model name')
                .env('LLM_MODEL')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--llm-base-url <value>', 'LLM base URL (for OpenAI-compatible providers, e.g. http://localhost:1234/v1)')
                .env('LLM_BASE_URL')
        )
        .addOption(
            new Option('--redis-host <value>', 'Redis host')
                .env('REDIS_HOST')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--conversation-ttl-days <number>', 'Conversation TTL in days')
                .env('CONVERSATION_TTL_DAYS')
                .argParser(v => parseInt(v))
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--rate-limit <number>', 'Max messages per minute per user')
                .env('RATE_LIMIT')
                .argParser(v => parseInt(v))
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--session-ttl-minutes <number>', 'Chat session TTL in minutes')
                .env('SESSION_TTL_MINUTES')
                .argParser(v => parseInt(v))
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--port <number>')
                .env('HTTP_PORT')
                .argParser(v => parseInt(v))
                .default(DEFAULT_HTTP_PORT)
        )
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    port,
    sepalEndpoint,
    geeEndpoint,
    redisHost,
    conversationTtlDays,
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
    redisHost,
    conversationTtlMs: conversationTtlDays * 24 * 60 * 60 * 1000,
    llmProvider,
    llmApiKey,
    llmModel,
    llmBaseUrl,
    rateLimit,
    sessionTtlMs: sessionTtlMinutes * 60 * 1000
}
