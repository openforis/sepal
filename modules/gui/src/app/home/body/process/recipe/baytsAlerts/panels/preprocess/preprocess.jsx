import {Options} from '~/app/home/body/process/recipe/baytsHistorical/panels/options/options'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'

import {supportedPassesOf} from '../../sourceRequirement'

// PRC: the radar processing BAYTS Historical's options panel edits, offering only the passes the reference is
// established to support.
const _Preprocess = ({supportedOrbits}) =>
    <Options monitor supportedOrbits={supportedOrbits}/>

export const Preprocess = compose(
    _Preprocess,
    connect((state, {recipeId, sourceRuntime}) => ({
        supportedOrbits: supportedPassesOf({
            state,
            recipe: selectFrom(state, ['process.loadedRecipes', recipeId]),
            evidenceOwnerOf: id => sourceRuntime?.evidenceOwnerOf(id),
            now: Date.now()
        })
    })),
    withSourceRuntime(),
    withRecipe(recipe => ({recipeId: recipe.id}))
)
