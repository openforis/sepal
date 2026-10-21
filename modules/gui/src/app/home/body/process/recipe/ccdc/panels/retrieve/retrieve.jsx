import PropTypes from 'prop-types'
import React from 'react'

import {requestStages} from '#sepal/recipe/classifiedOutputs'
import {fittedMeasures, requestedMeasures} from '#sepal/recipe/type/ccdc'
import {compose} from '~/compose'
import {groupedBandOptions, toDataSetIds} from '~/sources'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {withRecipe} from '../../../../recipeContext'
import {withSourceRuntime} from '../../../../sourceRuntime/sourceRuntimeContext'
import {MosaicRetrievePanel} from '../../../mosaic/panels/retrieve/retrievePanel'
import {BandOperationWatch, pixelOperationsAvailability} from '../../../operationAvailability'
import {submitRetrieveTask} from '../../ccdcRecipe'
import {ccdcMeasureSelection} from '../../retrieveSelection'

const mapRecipeToProps = recipe =>
    ({
        recipeId: recipe.id,
        model: recipe.model,
        sources: selectFrom(recipe, 'model.sources'),
        classificationLegend: selectFrom(recipe, 'ui.classification.classificationLegend'),
        classifierType: selectFrom(recipe, 'ui.classification.classifierType'),
        classifier: selectFrom(recipe, 'ui.classification.classifier'),
        corrections: selectFrom(recipe, 'model.options.corrections')
    })

// Retrieve exports the recipe's image output, which the panel holds the export to (retrieveOutput.js). The measures
// selected add what the server holds an export of them to beyond it (requireCcdcImageStages$, modules/gee): where what
// CCDC fits for them includes an output the Classification computes, the collection classified - which this holds the
// selection to (`requestGate`), and watches for as long as it is selected.
class _Retrieve extends React.Component {
    bandWatch = new BandOperationWatch()
    selected = []

    constructor(props) {
        super(props)
        this.requestGate = this.requestGate.bind(this)
        this.watchSelection = this.watchSelection.bind(this)
    }

    render() {
        return (
            <MosaicRetrievePanel
                bandOptions={this.bandOptions()}
                defaultScale={30}
                defaultAssetType='ImageCollection'
                defaultTileSize={0.5}
                toEE
                selection={ccdcMeasureSelection}
                submitTask={submitRetrieveTask}
                requestGate={this.requestGate}
                onRequestSelection={this.watchSelection}
            />
        )
    }

    // What is fitted for the selection follows the breakpoint bands too.
    componentDidUpdate() {
        this.watchBands()
    }

    componentWillUnmount() {
        this.bandWatch.unsubscribe()
    }

    // Judged from the session as given, with the recipe as it holds it then. What the image output needs is the panel's.
    requestGate(state, selected) {
        const {recipeId, sourceRuntime} = this.props
        const recipe = selectFrom(state, ['process.loadedRecipes', recipeId])
        const operations = recipe ? bandOperations(recipe.model, selected) : []
        return operations.length
            ? holdOf(pixelOperationsAvailability({state, recipe, heldFor: key => sourceRuntime?.heldFor(key), operations}).gate)
            : null
    }

    watchSelection(selected) {
        this.selected = selected
        this.watchBands()
    }

    watchBands() {
        const {recipeId, sourceRuntime, model} = this.props
        this.bandWatch.update({sourceRuntime, recipeId, operations: bandOperations(model, this.selected)})
    }

    // Labels and groups for the measures the collection helper knows; the output decides which are offered.
    bandOptions() {
        const {classificationLegend, classifierType, classifier, corrections, sources: {dataSets}} = this.props
        return groupedBandOptions({
            dataSets: toDataSetIds(dataSets),
            corrections,
            classification: {classifierType, classifier, classificationLegend, include: ['regression', 'probabilities']}
        })
    }
}

// What the measures selected add, as the server derives it: those CCDC fits for them (requestedMeasures), with its
// breakpoint bands (fittedMeasures), classified where any is an output the Classification computes (requestStages).
const bandOperations = (model, selected) =>
    requestStages(fittedMeasures(model, requestedMeasures({selection: selected})))

// What a hold says: that the Classification cannot be trained for them, that this is not yet, or could not be,
// established.
const holdOf = gate => {
    if (!gate) {
        return null
    }
    if (gate.withdraw) {
        return {wait: false, message: msg('process.retrieve.form.bands.classifiedWithheld')}
    }
    return gate.wait
        ? {wait: true, message: msg('process.retrieve.form.bands.checking')}
        : {wait: false, message: msg('process.retrieve.form.bands.uncheckable')}
}

export const Retrieve = compose(
    _Retrieve,
    withSourceRuntime(),
    withRecipe(mapRecipeToProps)
)

Retrieve.propTypes = {
    recipeId: PropTypes.string
}
