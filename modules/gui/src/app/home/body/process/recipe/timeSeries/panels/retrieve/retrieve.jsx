import PropTypes from 'prop-types'
import React from 'react'

import {isClassifiedOutput} from '#sepal/recipe/classifiedOutputs'
import {IMAGE_OUTPUT} from '#sepal/recipe/output/readiness'
import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {groupedBandOptions, toDataSetIds} from '~/sources'
import {selectFrom} from '~/stateUtils'

import {draftDisagreementsOfState} from '../../../../sourceRuntime/recordCurrency'
import {watchOperations} from '../../../operationAvailability'
import {readOperationReadiness} from '../../../operationReadiness'
import {selectedClassificationOfState} from '../../../selectedClassification'
import {RecipeActions} from '../../timeSeriesRecipe'

const mapRecipeToProps = recipe =>
    ({
        recipeId: recipe.id,
        recipe,
        sources: selectFrom(recipe, 'model.sources'),
        corrections: selectFrom(recipe, 'model.options.corrections')
    })

// What is offered of the Classification its Sources select, as the session holds it or as the readiness of what is
// retrieved - the recipe's image output, over its own AOI - resolved it (operationReadiness.js). The download is run
// from storage's copy, so what a draft of it offers is not established until storage agrees (draftDisagreementsOfState).
const mapStateToProps = (state, {recipe, sourceRuntime}) => {
    const {recordOf} = readOperationReadiness({
        recipe,
        operation: IMAGE_OUTPUT,
        loadedRecipes: selectFrom(state, 'process.loadedRecipes') || {},
        heldFor: key => sourceRuntime?.heldFor(key)
    })
    const classification = selectFrom(recipe, 'model.sources.classification')
    return {
        ...selectedClassificationOfState(state, recipe, recordOf),
        classificationDraft: Boolean(classification) && draftDisagreementsOfState(state, [classification]).length > 0
    }
}

class _Retrieve extends React.Component {
    render() {
        const requestOptions = this.requestOptions()
        return (
            <MosaicRetrievePanel
                requestOptions={requestOptions}
                pendingRequestOptions={this.pendingRequestOptions(requestOptions)}
                defaultScale={30}
                defaultTileSize={2}
                defaultShardSize={256}
                defaultFileDimensionsMultiple={2}
                single
                toSepal
                allowTiling
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
    }

    // The indicator a time series is downloaded for is a measure of its collection, not a band of an image this
    // recipe outputs, so the options are the whole truth of what may be asked for.
    requestOptions() {
        const {classificationLegend, classifierType, classifier, corrections, sources: {dataSets}} = this.props
        return groupedBandOptions({
            dataSets: toDataSetIds(dataSets),
            corrections,
            classification: {classifierType, classifier, classificationLegend, include: ['regression', 'probabilities']}
        })
    }

    // While the Classification is known only by the copy Sources took, or by a draft storage does not hold yet, the
    // outputs offered of it are not established.
    pendingRequestOptions(requestOptions) {
        const {classificationResolved, classificationDraft} = this.props
        return classificationResolved && !classificationDraft
            ? undefined
            : requestOptions.flat().map(({value}) => value).filter(isClassifiedOutput)
    }

    retrieve(retrieveOptions) {
        const {recipeId} = this.props
        return RecipeActions(recipeId).retrieve(retrieveOptions)
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
