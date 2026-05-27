// SEPAL product-domain tools. sepalTools() — orchestrator-facing list.
// specialistInnerTools() — list specialists see inside their inner loop
// (adds recipe_load + update_recipe_values).

const {guiContextTool} = require('./guiContextTool')
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

// recipe_load (describe), update_recipe_values (update), and
// create_recipe_values (create) are included here so recipe specialists can
// inspect, write, and create recipes. None are on the orchestrator surface.
// Specialists scope down further to a per-specialist allowed list.
function specialistInnerTools({guiRequests, bus}) {
    return [
        guiContextTool(),
        recipeListTool(guiRequests),
        ...projectTools(guiRequests),
        recipeLoadTool(guiRequests),
        updateRecipeValuesTool(guiRequests, bus),
        createRecipeValuesTool(guiRequests),
        ...mapTools(guiRequests)
    ]
}

module.exports = {sepalTools, specialistInnerTools}
