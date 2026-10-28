import PropTypes from 'prop-types'

import {mayProvideHistoricalStats} from '#sepal/recipe/capability/baytsHistoricalStats'
import {recipeAccess} from '~/app/home/body/process/recipeAccess'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {RecipeInput} from '~/widget/recipeInput'

// Recipes whose type may provide BAYTS historical statistics are offered - a Masking over a historical recipe among
// them. Whether the one selected does is the requirement's to judge (sourceCandidate.js). A saved selection stays
// selected, offered or not.
const _RecipeSection = ({inputs: {recipe}, labelButtons}) =>
    <RecipeInput
        label={msg('process.baytsAlerts.panel.reference.form.recipe.label')}
        labelButtons={labelButtons}
        filter={type => mayProvideHistoricalStats(type.id)}
        input={recipe}
        autoFocus
        keepSelection
        errorMessage
    />

export const RecipeSection = compose(
    _RecipeSection,
    recipeAccess()
)

RecipeSection.propTypes = {
    inputs: PropTypes.object.isRequired,
    labelButtons: PropTypes.array
}
