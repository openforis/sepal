// SEPAL product-domain tools. sepalTools() — orchestrator-facing list.
// specialistInnerTools() — full inner-loop tool registry. Each specialist
// scopes this down to the tools it is allowed to call.

const {guiContextTool} = require('./guiContextTool')
const {aoiTools} = require('./aoiTools')
const {mapTools} = require('./mapTools')
const {projectTools} = require('./projectTools')
const {recipeListTool, recipeOpenTool, recipeLoadTool} = require('./recipeTools')
const {updateRecipeValuesTool} = require('../specialists/updateRecipe/updateRecipeValuesTool')
const {createRecipeValuesTool} = require('../specialists/createRecipe/createRecipeValuesTool')

function sepalTools({guiRequests}) {
    return [
        guiContextTool(),
        recipeListTool(guiRequests),
        recipeOpenTool(guiRequests),
        ...projectTools(guiRequests),
        ...mapTools(guiRequests)
    ]
}

// Recipe value tools and specialist-only lookup tools live here, not on the
// orchestrator surface. Specialists scope down to a per-specialist allow-list.
function specialistInnerTools({guiRequests, bus}) {
    return [
        guiContextTool(),
        recipeListTool(guiRequests),
        ...projectTools(guiRequests),
        ...aoiTools(guiRequests),
        recipeLoadTool(guiRequests),
        updateRecipeValuesTool(guiRequests, bus),
        createRecipeValuesTool(guiRequests),
        ...mapTools(guiRequests)
    ]
}

module.exports = {sepalTools, specialistInnerTools}
