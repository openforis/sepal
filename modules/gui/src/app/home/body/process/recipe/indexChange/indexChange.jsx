import moment from 'moment'
import React from 'react'

import {FROM_IMAGE, TO_IMAGE} from '#sepal/recipe/type/indexChange'
import {initializeLayers} from '~/app/home/body/process/recipe/recipeImageLayerSource'
import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {changeImageRequirements} from '../changeImageRequirements'
import {bandPresentation} from './bands'
import {defaultModel} from './indexChangeRecipe'
import {IndexChangeToolbar} from './panels/indexChangeToolbar'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    fromImage: selectFrom(recipe, 'model.fromImage'),
    toImage: selectFrom(recipe, 'model.toImage'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _IndexChange extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
    }

    render() {
        const {fromImage, toImage} = this.props
        return (
            <Map>
                <IndexChangeToolbar/>
                <Aoi value={fromImage || toImage}/>
            </Map>
        )
    }
}

const IndexChange = compose(
    _IndexChange,
    recipe({defaultModel, mapRecipeToProps})
)

const getDateRange = recipe => {
    const {fromDate, toDate, targetDate} = recipe.model.dates
    const startDate = fromDate || targetDate
    const endDate = toDate || targetDate
    return [moment.utc(startDate, 'YYYY-MM-DD'), moment.utc(endDate, 'YYYY-MM-DD')]
}

export default () => ({
    id: 'INDEX_CHANGE',
    // The images it reads that the layout shows (mapLayout/dependencyLayerSources.js).
    dependencyLayerRoles: [FROM_IMAGE, TO_IMAGE],
    labels: {
        name: msg('process.indexChange.create'),
        creationDescription: msg('process.indexChange.description'),
        tabPlaceholder: msg('process.indexChange.tabPlaceholder'),
    },
    tags: ['CHANGE'],
    components: {
        recipe: IndexChange
    },
    sourceRequirements: changeImageRequirements([
        {section: {id: 'fromImage', label: 'process.indexChange.panel.inputImage.from.button.label'}, role: FROM_IMAGE, key: 'fromImage'},
        {section: {id: 'toImage', label: 'process.indexChange.panel.inputImage.to.button.label'}, role: TO_IMAGE, key: 'toImage'}
    ]),
    imageSource: true,
    getDateRange,
    bandPresentation,
    getPreSetVisualizations
})
