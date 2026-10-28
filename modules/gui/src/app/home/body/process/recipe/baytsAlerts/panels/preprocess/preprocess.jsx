import {Options} from '~/app/home/body/process/recipe/baytsHistorical/panels/options/options'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'

import {presentProcessingInputs, preserveProcessingCopies, settingsOf, unrecordedValues} from '../../processingSettings'
import {supportedPassesOf} from '../../sourceRequirement'

// PRC: the radar processing BAYTS Historical's options panel edits, as monitoring uses it. The reference's processing is
// shown as its own (processingSettings.js), and a setting the alerts own but saved no value for starts from the value
// monitoring takes for it; passes the reference is not established to support cannot be added; what monitoring never
// reads is not shown, and kept as saved.
const _Preprocess = ({supportedOrbits, settings}) =>
    <Options
        monitor
        supportedOrbits={supportedOrbits}
        presentInputs={presentProcessingInputs(settings)}
        modelToApply={preserveProcessingCopies(settings)}
        defaults={unrecordedValues(settings)}
    />

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
    withRecipe(recipe => ({recipeId: recipe.id, settings: settingsOf(recipe)}))
)
