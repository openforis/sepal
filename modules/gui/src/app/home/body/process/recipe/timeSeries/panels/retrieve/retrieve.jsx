import PropTypes from 'prop-types'
import React from 'react'

import {isClassifiedOutput, requestStages} from '#sepal/recipe/classifiedOutputs'
import {IMAGE_OUTPUT} from '#sepal/recipe/output/readiness'
import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {groupedBandOptions, toDataSetIds} from '~/sources'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {draftDisagreementsOfState} from '../../../../sourceRuntime/recordCurrency'
import {BandOperationWatch, requestedBandAvailability, watchOperations} from '../../../operationAvailability'
import {readOperationReadiness} from '../../../operationReadiness'
import {selectedClassificationOfState} from '../../../selectedClassification'
import {RecipeActions} from '../../timeSeriesRecipe'

// What a download is held to whatever indicators it names: the recipe's image output, over its own AOI, as the server
// holds it (modules/gee/src/jobs/task/export/timeSeries.js).
const RETRIEVE_OPERATIONS = [IMAGE_OUTPUT]

const mapRecipeToProps = recipe =>
    ({
        recipeId: recipe.id,
        recipe
    })

// What is offered of the Classification its Sources select, as the readiness of what is retrieved - the recipe's image
// output, over its own AOI - resolved it (operationReadiness.js).
const mapStateToProps = (state, {recipe, sourceRuntime}) => {
    const {recordOf} = readOperationReadiness({
        recipe,
        operation: IMAGE_OUTPUT,
        loadedRecipes: selectFrom(state, 'process.loadedRecipes') || {},
        heldFor: key => sourceRuntime?.heldFor(key)
    })
    return offeredClassificationOfState(state, recipe, recordOf)
}

class _Retrieve extends React.Component {
    bandWatch = new BandOperationWatch()

    constructor(props) {
        super(props)
        this.requestGate = this.requestGate.bind(this)
        this.watchSelection = this.watchSelection.bind(this)
    }

    render() {
        const {options, pending} = requestOffer(this.props.recipe, this.props)
        return (
            <MosaicRetrievePanel
                requestOptions={options}
                pendingRequestOptions={pending}
                requestGate={this.requestGate}
                onRequestSelection={this.watchSelection}
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

    // What the image output's readiness needs is read for as long as Retrieve is open, the Classification's record with it.
    componentDidMount() {
        const {recipeId, sourceRuntime} = this.props
        this.operationWatches = watchOperations({sourceRuntime, recipeId, operations: [IMAGE_OUTPUT]})
    }

    componentWillUnmount() {
        this.operationWatches.unsubscribe()
        this.bandWatch.unsubscribe()
    }

    // A selection is held, read from the session as given, with the recipe as it holds it then: while it names an
    // indicator not offered, or not yet established; and while what the download needs is not known to be met, as the
    // server holds it - the image output's readiness and, for indicators the Classification computes, the collection
    // classified (requestedBandAvailability). A submission is judged by the same, so what is offered is judged as it
    // stands then, not as last rendered.
    requestGate(state, selected) {
        const {recipeId, sourceRuntime} = this.props
        const recipe = selectFrom(state, ['process.loadedRecipes', recipeId])
        if (!recipe) {
            return null
        }
        const {gate, bandGate, recordOf} = requestedBandAvailability({
            state, recipe, heldFor: key => sourceRuntime?.heldFor(key), operations: RETRIEVE_OPERATIONS, bandOperations: requestStages(selected)
        })
        return offerHoldOf(selected, requestOffer(recipe, offeredClassificationOfState(state, recipe, recordOf)))
            || holdOf(gate, bandGate)
    }

    // What the selection adds is read for as long as it is selected.
    watchSelection(selected) {
        const {recipeId, sourceRuntime} = this.props
        this.bandWatch.update({sourceRuntime, recipeId, operations: requestStages(selected)})
    }

    retrieve(retrieveOptions) {
        const {recipeId} = this.props
        return RecipeActions(recipeId).retrieve(retrieveOptions)
    }
}

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

// What a hold says: a finding of what any indicator needs, in the section it is said in; one only of what the selected
// indicators the Classification computes add; or that it is not yet, or could not be, established.
const holdOf = (gate, bandGate) => {
    if (!gate) {
        return null
    }
    if (gate.withdraw) {
        return {
            wait: false,
            message: gate.section
                ? msg('process.retrieve.source.configurationUnmet', {section: msg(gate.section)})
                : msg('process.retrieve.error.imageOutput')
        }
    }
    if (gate.wait) {
        return {wait: true, message: msg('process.retrieve.form.bands.checking')}
    }
    return {
        wait: false,
        message: bandGate?.withdraw && gate.code === bandGate.code
            ? msg('process.retrieve.form.bands.classifiedWithheld')
            : msg('process.retrieve.form.bands.uncheckable')
    }
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
