import {Toolbar} from 'widget/toolbar/toolbar'
import {msg} from 'translate'
import {compose} from 'compose'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {sepalMap} from 'app/home/map/map'
import PropTypes from 'prop-types'
import React from 'react'
import GoogleSatelliteLayer from 'app/home/map/googleSatelliteLayer'

const mapRecipeToProps = recipe => {
    return {
        recipeId: recipe.id,
        isZooming: sepalMap.getContext(recipe.id).isZooming(),
    }
}

class ChartPixelButton extends React.Component {

    constructor(props) {
        super(props)
        this.state = {}
    }

    render() {
        const {isSelecting} = this.state
        return (
            <Toolbar.ToolbarButton
                selected={isSelecting}
                onClick={() => isSelecting ? this.cancelSelecting() : this.startSelecting()}
                icon={'chart-area'}
                tooltip={msg(`process.ccdc.mapToolbar.chartPixel.${isSelecting ? 'cancel' : 'start'}.tooltip`)}
            />
        )
    }

    startSelecting() {
        const {recipeId, showGoogleSatellite, onPixelSelected} = this.props
        this.setState({isSelecting: true})
        const context = sepalMap.getContext(recipeId)
        context.onOneClick(latLng => {
            if (showGoogleSatellite)
                context.removeLayer('googleSatellite')

            this.setState({isSelecting: false})
            onPixelSelected(latLng)
        })
        if (showGoogleSatellite)
            context.setLayer({id: 'googleSatellite', layer: new GoogleSatelliteLayer(1)})
    }

    cancelSelecting() {
        const {recipeId, showGoogleSatellite} = this.props
        this.setState({isSelecting: false})
        const context = sepalMap.getContext(recipeId)
        if (showGoogleSatellite)
            context.removeLayer('googleSatellite')
        context.clearClickListeners()
    }
}

ChartPixelButton.propTypes = {
    recipeId: PropTypes.string.isRequired,
    showGoogleSatellite: PropTypes.any,
    onPixelSelected: PropTypes.func.isRequired
}

export default compose(
    ChartPixelButton,
    withRecipe(mapRecipeToProps)
)
