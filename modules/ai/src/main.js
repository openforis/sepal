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
const {createTemplateTools} = require('./mcp/tools/templateTools')
const {createWorkflowTools} = require('./mcp/tools/workflowTools')
const {createConversationStore} = require('./chat/conversationStore')
const {createWsHandler} = require('./ws')
const {createRoutes} = require('./routes')

const main = async () => {
    // Initialize API clients
    const recipeClient = createRecipeClient({sepalEndpoint: config.sepalEndpoint})
    const geeClient = createGeeClient({geeEndpoint: config.geeEndpoint})

    // Initialize registry
    const registry = createRegistry()

    // Register recipe schemas
    const schemas = [
        require('./mcp/schemas/mosaic'),
        require('./mcp/schemas/radarMosaic'),
        require('./mcp/schemas/planetMosaic'),
        require('./mcp/schemas/classification'),
        require('./mcp/schemas/unsupervisedClassification'),
        require('./mcp/schemas/regression'),
        require('./mcp/schemas/timeSeries'),
        require('./mcp/schemas/ccdc'),
        require('./mcp/schemas/ccdcSlice'),
        require('./mcp/schemas/changeAlerts'),
        require('./mcp/schemas/baytsHistorical'),
        require('./mcp/schemas/baytsAlerts'),
        require('./mcp/schemas/classChange'),
        require('./mcp/schemas/indexChange'),
        require('./mcp/schemas/phenology'),
        require('./mcp/schemas/stack'),
        require('./mcp/schemas/bandMath'),
        require('./mcp/schemas/remapping'),
        require('./mcp/schemas/masking'),
        require('./mcp/schemas/asset'),
    ]
    schemas.forEach(schema => registry.registerSchema(schema))
    log.info(`Registered ${schemas.length} recipe schemas`)

    // Register templates
    const templates = [
        require('./mcp/templates/landsatAnnualMosaic'),
        require('./mcp/templates/sentinel2SeasonalMosaic'),
        require('./mcp/templates/radarMonthlyMosaic'),
        require('./mcp/templates/landCoverClassification'),
        require('./mcp/templates/forestChangeDetection'),
        require('./mcp/templates/ndviTimeSeries'),
        require('./mcp/templates/deforestationAlerts'),
        require('./mcp/templates/indexChangeMap'),
    ]
    templates.forEach(template => registry.registerTemplate(template))
    log.info(`Registered ${templates.length} templates`)

    // Register tools
    const allTools = [
        ...createRecipeTools({recipeClient, registry}),
        ...createIntrospectionTools({registry}),
        ...createGuiTools(),
        ...createTemplateTools({registry, recipeClient}),
        ...createWorkflowTools({registry, recipeClient}),
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
