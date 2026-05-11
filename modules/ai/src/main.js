require('#sepal/log').configureServer(require('#config/log.json'))

const log = require('#sepal/log').getLogger('main')

const config = require('./config')
const server = require('#sepal/httpServer')
const {createRegistry} = require('./mcp/registry')
const {createGeeClient} = require('./sepal/geeClient')
const {createRecipeTools} = require('./mcp/tools/recipeTools')
const {createProjectTools} = require('./mcp/tools/projectTools')
const {createSchemaTools} = require('./mcp/tools/schemaTools')
const {createAoiTools} = require('./mcp/tools/aoiTools')
const {createAssetTools} = require('./mcp/tools/assetTools')
const {createVisualizationTools} = require('./mcp/tools/visualizationTools')
const {createImageTools} = require('./mcp/tools/imageTools')
// Templates and workflows are disabled.
// const {createTemplateTools} = require('./mcp/tools/templateTools')
// const {createWorkflowTools} = require('./mcp/tools/workflowTools')
const {createRecipeValidator} = require('./mcp/validation/recipeValidator')
const {createConversationStore} = require('./chat/conversationStore')
const {createWsHandler} = require('./ws')
const {createRoutes} = require('./routes')

const main = async () => {
    // Initialize API clients
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
        require('./recipes/bandMath'),
        require('./recipes/masking'),
        require('./recipes/stack'),
        require('./recipes/planetMosaic'),
        require('./recipes/unsupervisedClassification'),
        require('./recipes/timeSeries'),
        require('./recipes/phenology'),
        require('./recipes/regression'),
        require('./recipes/ccdcSlice'),
        require('./recipes/ccdc'),
        require('./recipes/baytsHistorical'),
        require('./recipes/baytsAlerts'),
        require('./recipes/changeAlerts'),
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
        ...createRecipeTools({recipeValidator, registry}),
        ...createProjectTools(),
        ...createSchemaTools({registry}),
        ...createAoiTools(),
        ...createAssetTools({geeClient}),
        ...createVisualizationTools(),
        ...createImageTools(),
        // ...createTemplateTools({registry, recipeValidator}),
        // ...createWorkflowTools({registry, recipeValidator}),
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
