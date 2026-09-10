import moment from 'moment'
import React from 'react'

import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {initializeLayers} from '../recipeImageLayerSource'
import {sourceKeyOf} from '../sourceEvidence'
import {SourceEvidenceSync} from '../sourceEvidenceSync'
import {defaultModel, preSetVisualizations, RecipeActions} from './ccdcSliceRecipe'
import {CcdcSliceToolbar} from './panels/ccdcSliceToolbar'
import {availableBandsOf, selectedSource} from './sliceEvidence'
import {resolveEvidence$, sliceObservation} from './sliceObservation'

const mapRecipeToProps = recipe => ({
    source: selectFrom(recipe, 'model.source'),
    sourceKey: sourceKeyOf(selectedSource(recipe)),
    savedLayers: selectFrom(recipe, 'layers'),
    savedLayerSource: selectFrom(recipe, 'ui.savedLayerSource')
})

class _CcdcSlice extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, savedLayerSource, sourceKey, recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
        if (savedLayerSource === undefined) {
            this.recipeActions.recordSavedLayerSource(sourceKey)
        }
        initializeLayers({recipeId, savedLayers})
    }

    render() {
        const {source} = this.props
        return (
            <Map>
                <CcdcSliceToolbar/>
                <Aoi value={source.type && source}/>
                <SourceEvidenceSync observation={sliceObservation}/>
            </Map>
        )
    }

}

const CcdcSlice = compose(
    _CcdcSlice,
    recipe({defaultModel, mapRecipeToProps})
)

export default () => ({
    id: 'CCDC_SLICE',
    labels: {
        name: msg('process.ccdcSlice.create'),
        creationDescription: msg('process.ccdcSlice.description'),
        tabPlaceholder: msg('process.ccdcSlice.tabPlaceholder')
    },
    tags: ['TIME_SERIES'],
    components: {
        recipe: CcdcSlice
    },
    getDateRange(recipe) {
        const date = moment.utc(recipe.model.date.date, 'YYYY-MM-DD')
        return [date, date]
    },
    resolveEvidence$,
    getAvailableBands: (recipe, evidence) => availableBandsOf(recipe, evidence?.segments),
    getPreSetVisualizations: (recipe, evidence) => preSetVisualizations(recipe, evidence?.segments)
})
