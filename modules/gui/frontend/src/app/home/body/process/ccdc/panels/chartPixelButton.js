import {RecipeActions} from '../ccdcRecipe'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {withRecipe} from 'app/home/body/process/recipeContext'
import GoogleSatelliteLayer from 'app/home/map/googleSatelliteLayer'
import PropTypes from 'prop-types'
import React from 'react'

const mapRecipeToProps = (recipe, ownProps) => {
    const {mapContext: {sepalMap}} = ownProps
    return {
        recipeId: recipe.id,
        isZooming: sepalMap.isZooming(),
    }
}

class ChartPixelButton extends React.Component {

    constructor(props) {
        super(props)
        this.state = {}
        this.recipeActions = RecipeActions(props.recipeId)
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
        const {mapContext: {sepalMap, google, googleMap}} = this.props
        this.setState({isSelecting: true})
        sepalMap.onOneClick(latLng => {
            sepalMap.removeLayer('googleSatellite')
            this.setChartPixel(latLng)
        })
        sepalMap.setLayer({id: 'googleSatellite', layer: new GoogleSatelliteLayer({google, googleMap, layerIndex: 1})})
    }

    cancelSelecting() {
        const {mapContext: {sepalMap}} = this.props
        this.setState({isSelecting: false})
        sepalMap.removeLayer('googleSatellite')
        sepalMap.clearClickListeners()
    }

    setChartPixel(latLng) {
        this.setState({isSelecting: false})
        this.recipeActions.setChartPixel(latLng)
    }
}

ChartPixelButton.propTypes = {
    mapContext: PropTypes.object.isRequired
}

export default compose(
    ChartPixelButton,
    withRecipe(mapRecipeToProps)
)
