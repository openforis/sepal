// SEPAL product-domain tools. sepalTools() — orchestrator-facing list.
// specialistInnerTools() — full inner-loop tool registry. Each specialist
// scopes this down to the tools it is allowed to call.

import {createRecipeValuesTool} from '../specialists/createRecipe/createRecipeValuesTool.js'
import {updateRecipeValuesTool} from '../specialists/updateRecipe/updateRecipeValuesTool.js'
import {aoiTools} from './aoiTools.js'
import {guiContextTool} from './guiContextTool.js'
import {mapTools} from './mapTools.js'
import {projectTools} from './projectTools.js'
import {recipeListTool, recipeLoadTool, recipeOpenTool} from './recipeTools.js'

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

export {sepalTools, specialistInnerTools}
