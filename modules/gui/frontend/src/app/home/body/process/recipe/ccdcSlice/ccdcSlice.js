import {Aoi} from '../aoi'
import {Map} from 'app/home/map/map'
import {RecipeActions} from './ccdcSliceRecipe'
import {SourceSync} from './sourceSync'
import {compose} from 'compose'
import {defaultModel} from './ccdcSliceRecipe'
import {initializeLayers} from '../recipeImageLayerSource'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import CCDCSliceToolbar from './panels/ccdcSliceToolbar'
import React from 'react'

const mapRecipeToProps = recipe => ({
    source: selectFrom(recipe, 'model.source'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _CcdcSlice extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        const {source} = this.props
        return (
            <Map>
                <CCDCSliceToolbar/>
                <Aoi value={source.type && source}/>
                <SourceSync/>
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
    components: {
        recipe: CcdcSlice
    }
})
