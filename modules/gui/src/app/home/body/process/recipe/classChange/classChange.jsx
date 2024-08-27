import moment from 'moment'
import React from 'react'

import {initializeLayers} from '~/app/home/body/process/recipe/recipeImageLayerSource'
import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {getAvailableBands} from './bands'
import {defaultModel} from './classChangeRecipe'
import {ClassChangeToolbar} from './panels/classChangeToolbar'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    fromImage: selectFrom(recipe, 'model.fromImage'),
    toImage: selectFrom(recipe, 'model.toImage'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _ClassChange extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
    }

    render() {
        const {fromImage, toImage} = this.props
        return (
            <Map>
                <ClassChangeToolbar/>
                <Aoi value={fromImage || toImage}/>
            </Map>
        )
    }
}

const ClassChange = compose(
    _ClassChange,
    recipe({defaultModel, mapRecipeToProps})
)

const getDateRange = recipe => {
    const {fromDate, toDate, targetDate} = recipe.model.dates
    const startDate = fromDate || targetDate
    const endDate = toDate || targetDate
    return [moment.utc(startDate, 'YYYY-MM-DD'), moment.utc(endDate, 'YYYY-MM-DD')]
}

const getDependentRecipeIds = recipe =>
    [
        (selectFrom(recipe, 'model.fromImage') || {}),
        (selectFrom(recipe, 'model.toImage') || {}),
    ]
        .filter(({type}) => type === 'RECIPE_REF')
        .map(({id}) => id)

export default () => ({
    id: 'CLASS_CHANGE',
    labels: {
        name: msg('process.classChange.create'),
        creationDescription: msg('process.classChange.description'),
        tabPlaceholder: msg('process.classChange.tabPlaceholder'),
    },
    tags: ['CHANGE'],
    components: {
        recipe: ClassChange
    },
    getDependentRecipeIds,
    getDateRange,
    getAvailableBands,
    getPreSetVisualizations
})
