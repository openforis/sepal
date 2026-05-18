// SEPAL product-domain tools. sepalTools() is the pure list (no
// specialist-backed tools); specialist-backed tools are added at
// chat-level composition in orchestratorToolRegistry.js.
// specialistInnerTools() is the list specialists see inside their inner
// loop — adds recipe_load (specialist-private) on top.

const {contextTool} = require('./contextTool')
const {mapTools} = require('./mapTools')
const {projectTools} = require('./projectTools')
const {recipeListTool, recipeOpenTool, recipeLoadTool} = require('./recipeTools')

function sepalTools({guiRequests}) {
    return [
        contextTool(),
        recipeListTool(guiRequests),
        recipeOpenTool(guiRequests),
        ...projectTools(guiRequests),
        ...mapTools(guiRequests)
    ]
}

// recipe_load is included here so the recipe specialist can inspect a
// recipe; it's deliberately not on the orchestrator surface.
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
