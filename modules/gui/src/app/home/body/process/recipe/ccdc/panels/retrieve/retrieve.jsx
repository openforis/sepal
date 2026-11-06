import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {groupedBandOptions, toDataSetIds} from '~/sources'
import {selectFrom} from '~/stateUtils'

import {withRecipe} from '../../../../recipeContext'
import {withSourceRuntime} from '../../../../sourceRuntime/sourceRuntimeContext'
import {MosaicRetrievePanel} from '../../../mosaic/panels/retrieve/retrievePanel'
import {retrievedRecordOf} from '../../../retrieveOutput'
import {selectedClassificationOfState} from '../../../selectedClassification'
import {submitRetrieveTask} from '../../ccdcRecipe'
import {ccdcMeasureSelection} from '../../retrieveSelection'

const mapRecipeToProps = recipe =>
    ({
        recipeId: recipe.id,
        sources: selectFrom(recipe, 'model.sources'),
        corrections: selectFrom(recipe, 'model.options.corrections')
    })

// The Classification its Sources select, as the session holds it or as the output read of what is retrieved resolved it.
const mapStateToProps = (state, {recipeId, sourceRuntime}) =>
    selectedClassificationOfState(state, selectFrom(state, ['process.loadedRecipes', recipeId]), retrievedRecordOf(state, recipeId, sourceRuntime))

// Retrieve exports the recipe's image output, which the panel holds the export to, as it stands at submission
// (retrieveOutput.js): the Classification its Sources select trainable among it, whatever measures are selected
// (type/ccdc.js). A measure the Classification does not provide is not offered.
class _Retrieve extends React.Component {
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
            />
        )
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

export const Retrieve = compose(
    _Retrieve,
    connect(mapStateToProps),
    withSourceRuntime(),
    withRecipe(mapRecipeToProps)
)

Retrieve.propTypes = {
    recipeId: PropTypes.string
}
