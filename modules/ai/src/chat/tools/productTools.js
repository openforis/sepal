const {contextTool} = require('./contextTool')
const {mapTools} = require('./mapTools')
const {projectTools} = require('./projectTools')
const {recipeListTool, recipeLoadTool} = require('./recipeTools')

function productTools({guiRequests}) {
    return [
        contextTool(),
        recipeListTool(guiRequests),
        ...projectTools(guiRequests),
        recipeLoadTool(guiRequests),
        ...mapTools(guiRequests)
    ]
}

module.exports = {productTools}
