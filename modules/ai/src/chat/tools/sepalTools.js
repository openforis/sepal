const {contextTool} = require('./contextTool')
const {mapTools} = require('./mapTools')
const {projectTools} = require('./projectTools')
const {recipeListTool, recipeLoadTool} = require('./recipeTools')

// SEPAL product-domain tools. Specialist-backed tools (e.g. describe_recipe)
// are added at chat-level composition in orchestratorToolRegistry.js, not here.
function sepalTools({guiRequests}) {
    return [
        contextTool(),
        recipeListTool(guiRequests),
        ...projectTools(guiRequests),
        ...mapTools(guiRequests)
    ]
}

// Tools available inside the specialist inner registry. recipe_load is included
// so the recipe specialist can inspect a recipe; it is not part of the
// orchestrator's public surface.
function specialistInnerTools({guiRequests}) {
    return [
        contextTool(),
        recipeListTool(guiRequests),
        ...projectTools(guiRequests),
        recipeLoadTool(guiRequests),
        ...mapTools(guiRequests)
    ]
}

module.exports = {sepalTools, specialistInnerTools}
