import {registerAoiActions} from './aoiActions'
import {registerImageActions} from './imageActions'
import {registerProjectActions} from './projectActions'
import {registerRecipeActions} from './recipeActions'
import {registerVisualizationActions} from './visualizationActions'

export const registerChatActions = () => {
    registerRecipeActions()
    registerProjectActions()
    registerVisualizationActions()
    registerAoiActions()
    registerImageActions()
}
