import PropTypes from 'prop-types'
import React from 'react'

import {isClassifiedOutput} from '#sepal/recipe/classifiedOutputs'
import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {groupedBandOptions, toDataSetIds} from '~/sources'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {draftDisagreementsOfState} from '../../../../sourceRuntime/recordCurrency'
import {readRetrieveOutput} from '../../../retrieveOutput'
import {selectedClassificationOfState} from '../../../selectedClassification'
import {RecipeActions} from '../../timeSeriesRecipe'

// A download is held, whatever indicators it names, to the recipe's image output - the analysis prerequisites of its
// type among it (type/timeSeries.js) - as the server holds it (modules/gee/src/jobs/task/export/timeSeries.js). The
// shared panel reads, watches and judges that output as it does any recipe's (retrievePanel.jsx); what is particular
// here is what indicators are offered, and holding a selection to them.

const mapRecipeToProps = recipe =>
    ({
        recipeId: recipe.id,
        recipe
    })

// What is offered of the Classification its Sources select, as the output read of what is retrieved resolved it.
const mapStateToProps = (state, {recipe, sourceRuntime}) =>
    offeredClassificationOfState(state, recipe, retrievedRecordOf(state, recipe.id, sourceRuntime))

class _Retrieve extends React.Component {
    constructor(props) {
        super(props)
        this.requestGate = this.requestGate.bind(this)
    }

    render() {
        const {options, pending} = requestOffer(this.props.recipe, this.props)
        return (
            <MosaicRetrievePanel
                requestOptions={options}
                pendingRequestOptions={pending}
                requestGate={this.requestGate}
                defaultScale={30}
                defaultTileSize={2}
                defaultShardSize={256}
                defaultFileDimensionsMultiple={2}
                toSepal
                allowTiling
                sitsOutput
                onRetrieve={retrieveOptions => this.retrieve(retrieveOptions)}
            />
        )
    }

    // A selection is held, read from the session as given, with the recipe as it holds it then, while it names an
    // indicator not offered, or not yet established. A submission is judged by the same, so what is offered is judged as
    // it stands then, not as last rendered.
    requestGate(state, selected) {
        const {recipeId, sourceRuntime} = this.props
        const recipe = selectFrom(state, ['process.loadedRecipes', recipeId])
        return recipe
            ? offerHoldOf(selected, requestOffer(recipe, offeredClassificationOfState(state, recipe, retrievedRecordOf(state, recipeId, sourceRuntime))))
            : null
    }

    retrieve(retrieveOptions) {
        const {recipeId} = this.props
        return RecipeActions(recipeId).retrieve(retrieveOptions)
    }
}

// A record of what is retrieved, as the answer the runtime holds for the panel's output read read it (retrieveOutput.js).
const retrievedRecordOf = (state, recipeId, sourceRuntime) =>
    readRetrieveOutput({
        state,
        recipeId,
        heldFor: key => sourceRuntime?.heldFor(key),
        evidenceOwnerOf: id => sourceRuntime?.evidenceOwnerOf(id)
    })?.recordOf || (() => null)

// What is offered of the Classification its Sources select, as the session holds it or as `recordOf` resolved it
// (selectedClassificationOfState). The download is run from storage's copy, so what a draft of it offers is not
// established until storage agrees (draftDisagreementsOfState).
const offeredClassificationOfState = (state, recipe, recordOf) => {
    const id = selectFrom(recipe, 'model.sources.classification')
    return {
        ...selectedClassificationOfState(state, recipe, recordOf),
        classificationDraft: Boolean(id) && draftDisagreementsOfState(state, [id]).length > 0
    }
}

// The indicators a time series is downloaded for are measures of its collection, not bands of an image this recipe
// outputs, so the options are the whole truth of what may be asked for: {options, pending}. While the Classification is
// known only by the copy Sources took, or by a draft storage does not hold yet, the outputs offered of it are not
// established (`pending`).
const requestOffer = (recipe, {classificationLegend, classifierType, classifier, classificationResolved, classificationDraft}) => {
    const options = groupedBandOptions({
        dataSets: toDataSetIds(selectFrom(recipe, 'model.sources.dataSets')),
        corrections: selectFrom(recipe, 'model.options.corrections'),
        classification: {classifierType, classifier, classificationLegend, include: ['regression', 'probabilities']}
    })
    const pending = classificationResolved && !classificationDraft
        ? undefined
        : options.flat().map(({value}) => value).filter(isClassifiedOutput)
    return {options, pending}
}

// A selection naming indicators not offered is held, naming them; one naming indicators not yet established waits.
const offerHoldOf = (selected, {options, pending}) => {
    const offered = options.flat().map(({value}) => value)
    const unoffered = selected.filter(value => !offered.includes(value))
    if (unoffered.length) {
        return {wait: false, message: msg('process.retrieve.form.bands.unavailable', {bands: unoffered.join(', ')})}
    }
    return selected.some(value => pending?.includes(value))
        ? {wait: true, message: msg('process.retrieve.form.bands.checking')}
        : null
}

export const Retrieve = compose(
    _Retrieve,
    connect(mapStateToProps),
    withSourceRuntime(),
    withRecipe(mapRecipeToProps)
)

Retrieve.propTypes = {
    recipeId: PropTypes.string
}
