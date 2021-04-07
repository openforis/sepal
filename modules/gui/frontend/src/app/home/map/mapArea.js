import {RecipeMap} from 'app/home/body/process/recipe/recipeMap'
import PropTypes from 'prop-types'
import React from 'react'

export class MapArea extends React.Component {
    render() {
        const {source: {type, sourceConfig}, layerConfig, map} = this.props
        switch(type) {
        case 'Recipe': return (
            <RecipeMap
                recipeId={sourceConfig.recipeId}
                layerConfig={layerConfig}
                map={map}/>
        )
        default: throw Error(`Unsupported layer type: ${type}`)
        }
    }
}

MapArea.propTypes = {
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
