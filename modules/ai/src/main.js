require('#sepal/log').configureServer(require('#config/log.json'))

const log = require('#sepal/log').getLogger('main')

const config = require('./config')
const server = require('#sepal/httpServer')
const {createRegistry} = require('./mcp/registry')
const {createRecipeClient} = require('./sepal/recipeClient')
const {createGeeClient} = require('./sepal/geeClient')
const {createRecipeTools} = require('./mcp/tools/recipeTools')
const {createIntrospectionTools} = require('./mcp/tools/introspectionTools')
const {createGuiTools} = require('./mcp/tools/guiTools')
const {createAoiTools} = require('./mcp/tools/aoiTools')
const {createAssetTools} = require('./mcp/tools/assetTools')
// Templates and workflows are disabled.
// const {createTemplateTools} = require('./mcp/tools/templateTools')
// const {createWorkflowTools} = require('./mcp/tools/workflowTools')
const {createRecipeValidator} = require('./mcp/validation/recipeValidator')
const {createConversationStore} = require('./chat/conversationStore')
const {createWsHandler} = require('./ws')
const {createRoutes} = require('./routes')

const main = async () => {
    // Initialize API clients
    const recipeClient = createRecipeClient({sepalEndpoint: config.sepalEndpoint})
    const geeClient = createGeeClient({geeEndpoint: config.geeEndpoint})

    // Initialize registry
    const registry = createRegistry()

    const schemas = [
        require('./recipes/radarMosaic'),
        require('./recipes/opticalMosaic'),
        require('./recipes/classification'),
        require('./recipes/indexChange'),
        require('./recipes/classChange'),
        require('./recipes/remapping'),
        require('./recipes/asset'),
    ]
    schemas.forEach(schema => registry.registerSchema(schema))
    log.info(`Registered ${schemas.length} recipe schemas`)

    // Templates are disabled.
    // const templates = [
    //     require('./mcp/templates/radarMonthlyMosaic'),
    // ]
    // templates.forEach(template => registry.registerTemplate(template))
    // log.info(`Registered ${templates.length} templates`)

    // Initialize recipe validator
    const recipeValidator = createRecipeValidator({registry})
    log.info('Recipe validator initialized')

    // Register tools. Templates and workflows are disabled.
    const allTools = [
        ...createRecipeTools({recipeClient, registry, recipeValidator}),
        ...createIntrospectionTools({registry}),
        ...createGuiTools(),
        ...createAoiTools(),
        ...createAssetTools({geeClient}),
        // ...createTemplateTools({registry, recipeClient, recipeValidator}),
        // ...createWorkflowTools({registry, recipeClient, recipeValidator}),
    ]
    registry.registerTools(allTools)
    log.info(`Registered ${allTools.length} tools`)

    // Initialize conversation store
    const conversationStore = createConversationStore({
        redisHost: config.redisHost,
        ttlMs: config.conversationTtlMs
    })
    log.info('Conversation store initialized')

    // Create websocket handler
    const wsHandler = createWsHandler({config, registry, conversationStore})

    // Create routes
    const {routes, wsRoutes} = createRoutes({wsHandler})

    // Start server
    await server.start({
        port: config.port,
        routes,
        wsRoutes
    })

    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
