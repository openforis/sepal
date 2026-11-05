import moment from 'moment'
import React from 'react'

import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {classificationReferenceFeedback, collectionClassifierRequirements} from '../collectionClassifierRequirements'
import {initializeLayers} from '../recipeImageLayerSource'
import {withSelectedClassification} from '../selectedClassification'
import {bandPresentation} from './bands'
import {TimeSeriesToolbar} from './panels/timeSeriesToolbar'
import {defaultModel} from './timeSeriesRecipe'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _TimeSeries extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers, defaultGoogleSatellite: true})
    }

    render() {
        const {aoi} = this.props
        return (
            <Map>
                <TimeSeriesToolbar/>
                <Aoi value={aoi}/>
            </Map>
        )
    }
}

// The root holds the Classification its Sources select for as long as its tab is open (selectedClassification.js).
const TimeSeries = compose(
    _TimeSeries,
    withSelectedClassification({loadError: 'process.timeSeries.panel.sources.classificationLoadError'}),
    recipe({defaultModel, mapRecipeToProps})
)

const SOURCES = {id: 'sources', label: 'process.timeSeries.panel.sources.button'}

export default () => ({
    id: 'TIME_SERIES',
    labels: {
        name: msg('process.timeSeries.create'),
        creationDescription: msg('process.timeSeries.description'),
        tabPlaceholder: msg('process.timeSeries.tabPlaceholder')
    },
    tags: ['TIME_SERIES'],
    components: {
        recipe: TimeSeries
    },
    sourceRequirements: [
        ...collectionClassifierRequirements(SOURCES),
        classificationReferenceFeedback(SOURCES)
    ],
    imageSource: false,
    // Keeps a time series out of other recipes' source pickers. It says nothing of its image: that is declared, and
    // its map shows it.
    getDateRange: recipe => [
        moment.utc(recipe.model.dates.startDate, 'YYYY-MM-DD'),
        moment.utc(recipe.model.dates.endDate, 'YYYY-MM-DD')
    ],
    bandPresentation,
    getPreSetVisualizations
})
