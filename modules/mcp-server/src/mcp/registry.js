const log = require('#sepal/log').getLogger('tools')

const createRegistry = () => {
    const tools = {}
    const schemas = {}
    const templates = {}

    const registerTool = tool => {
        tools[tool.name] = tool
        log.debug(`Tool registered: ${tool.name}`)
    }

    const registerTools = toolList => {
        toolList.forEach(registerTool)
    }

    const registerSchema = schema => {
        schemas[schema.id] = schema
        log.debug(`Schema registered: ${schema.id}`)
    }

    const registerTemplate = template => {
        templates[template.id] = template
        log.debug(`Template registered: ${template.id}`)
    }

    const getTool = name => tools[name] || null

    const listTools = () =>
        Object.values(tools).map(({name, description, parameters}) => ({
            name, description, parameters
        }))

    const getSchema = type => schemas[type] || null

    const listSchemas = () => Object.values(schemas)

    const getTemplate = id => templates[id] || null

    const listTemplates = ({type, tags} = {}) => {
        let result = Object.values(templates)
        if (type) {
            result = result.filter(t => t.recipeType === type)
        }
        if (tags && tags.length > 0) {
            result = result.filter(t =>
                tags.some(tag => t.tags && t.tags.includes(tag))
            )
        }
        return result
    }

    return {
        registerTool,
        registerTools,
        registerSchema,
        registerTemplate,
        getTool,
        listTools,
        getSchema,
        listSchemas,
        getTemplate,
        listTemplates
    }
}

module.exports = {createRegistry}
