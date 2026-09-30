import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {groupedBandOptions, toDataSetIds} from '~/sources'
import {selectFrom} from '~/stateUtils'

import {withRecipe} from '../../../../recipeContext'
import {MosaicRetrievePanel} from '../../../mosaic/panels/retrieve/retrievePanel'
import {submitRetrieveTask} from '../../ccdcRecipe'
import {ccdcMeasureSelection} from '../../retrieveSelection'

const mapRecipeToProps = recipe =>
    ({
        recipeId: recipe.id,
        sources: selectFrom(recipe, 'model.sources'),
        classificationLegend: selectFrom(recipe, 'ui.classification.classificationLegend'),
        classifierType: selectFrom(recipe, 'ui.classification.classifierType'),
        corrections: selectFrom(recipe, 'model.options.corrections')
    })

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
        const {classificationLegend, classifierType, corrections, sources: {dataSets}} = this.props
        return groupedBandOptions({
            dataSets: toDataSetIds(dataSets),
            corrections,
            classification: {classifierType, classificationLegend, include: ['regression', 'probabilities']}
        })
    }
}

export const Retrieve = compose(
    _Retrieve,
    withRecipe(mapRecipeToProps)
)

Retrieve.propTypes = {
    recipeId: PropTypes.string
}
