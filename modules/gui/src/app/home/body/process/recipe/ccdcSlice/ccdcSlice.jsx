import moment from 'moment'
import React from 'react'

import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {initializeLayers} from '../recipeImageLayerSource'
import {SourceEvidenceSync} from '../sourceEvidenceSync'
import {defaultModel, preSetVisualizations} from './ccdcSliceRecipe'
import {CcdcSliceToolbar} from './panels/ccdcSliceToolbar'
import {resolveEvidence$, sliceObservation} from './sliceObservation'
import {sliceRequirements} from './sourceRequirement'

const mapRecipeToProps = recipe => ({
    source: selectFrom(recipe, 'model.source'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _CcdcSlice extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
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
    imageSource: true,
    getDateRange(recipe) {
        const date = moment.utc(recipe.model.date.date, 'YYYY-MM-DD')
        return [date, date]
    },
    resolveEvidence$,
    getPreSetVisualizations: (recipe, evidence) => preSetVisualizations(recipe, evidence?.segments),
    sourceRequirements: sliceRequirements,
    // What a layer, Retrieve or chart observes to check the source it requires, wherever it is shown.
    sourceObservation: sliceObservation
})
