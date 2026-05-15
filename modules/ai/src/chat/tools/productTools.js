// Composition module. Assembles the two tool surfaces used by the conversation:
// productTools() is the orchestrator-visible surface; specialistInnerTools() is
// the surface available inside specialist runtimes. It is the one file in
// tools/ that imports from sibling slice specialists/ — describe_recipe is an
// operation tool whose machinery uses the specialist runtime. When the recipe
// operation family grows (update_recipe, create_recipe), this composition role
// should lift out of tools/ into a sibling productSurface.js at src/chat/.
const {contextTool} = require('./contextTool')
const {mapTools} = require('./mapTools')
const {projectTools} = require('./projectTools')
const {recipeListTool, recipeLoadTool} = require('./recipeTools')
const {describeRecipeTool} = require('../specialists/recipeSpecialists')

// Orchestrator-visible tools. recipe_load is hidden behind describe_recipe so
// raw recipe JSON stays specialist-private.
function productTools({guiRequests, llm, tracer, innerTools}) {
    return [
        contextTool(),
        recipeListTool(guiRequests),
        ...projectTools(guiRequests),
        describeRecipeTool({llm, tracer, innerTools}),
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

module.exports = {productTools, specialistInnerTools}
