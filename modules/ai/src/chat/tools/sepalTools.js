// SEPAL product-domain tools. sepalTools() — orchestrator-facing list.
// specialistInnerTools() — list specialists see inside their inner loop
// (adds recipe_load).

const {guiContextTool} = require('./guiContextTool')
const {mapTools} = require('./mapTools')
const {projectTools} = require('./projectTools')
const {recipeListTool, recipeOpenTool, recipeLoadTool} = require('./recipeTools')
const {recipePatchTool} = require('./recipePatchTool')
const {prepareUpdateTool} = require('./prepareUpdateTool')

function sepalTools({guiRequests}) {
    return [
        guiContextTool(),
        recipeListTool(guiRequests),
        recipeOpenTool(guiRequests),
        ...projectTools(guiRequests),
        ...mapTools(guiRequests)
    ]
}

// recipe_load (describe) + prepare_update / recipe_patch (update) are
// included here so recipe specialists can inspect and write a recipe. None are
// on the orchestrator surface. Specialists scope down further to a
// per-specialist allowed list.
function specialistInnerTools({guiRequests}) {
    return [
        guiContextTool(),
        recipeListTool(guiRequests),
        ...projectTools(guiRequests),
        recipeLoadTool(guiRequests),
        prepareUpdateTool(guiRequests),
        recipePatchTool(guiRequests),
        ...mapTools(guiRequests)
    ]
}

module.exports = {sepalTools, specialistInnerTools}
