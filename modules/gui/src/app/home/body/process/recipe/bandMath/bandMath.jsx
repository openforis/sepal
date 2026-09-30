import React from 'react'

import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {initializeLayers} from '../recipeImageLayerSource'
import {getDefaultModel} from './bandMathRecipe'
import {BandMathToolbar} from './panels/bandMathToolbar'
import {Sync} from './sync/sync'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    images: selectFrom(recipe, 'model.inputImagery.images'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _BandMath extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({
            recipeId,
            savedLayers
        })
    }

    render() {
        const {images} = this.props
        return (
            <Map>
                <Sync/>
                <BandMathToolbar/>
                <Aoi value={images && images.length && images[0]}/>
            </Map>
        )
    }
}

const BandMath = compose(
    _BandMath,
    recipe({getDefaultModel, mapRecipeToProps})
)

export default () => ({
    id: 'BAND_MATH',
    labels: {
        name: msg('process.bandMath.create'),
        creationDescription: msg('process.bandMath.description'),
        tabPlaceholder: msg('process.bandMath.tabPlaceholder'),
    },
    components: {
        recipe: BandMath
    },
    imageSource: true,
    getDateRange(_recipe) {
        return null
    },
    getPreSetVisualizations
})
