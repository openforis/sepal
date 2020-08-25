import {RecipeActions} from '../ccdcRecipe'
import {Toolbar} from 'widget/toolbar/toolbar'
import {msg} from 'translate'
import {compose} from 'compose'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {sepalMap} from '../../../../map/map'
import PropTypes from 'prop-types'
import React from 'react'

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
        const {recipeId} = this.props
        this.setState({isSelecting: true})
        sepalMap.getContext(recipeId).onOneClick(latLng => this.setChartPixel(latLng))
    }

    cancelSelecting() {
        const {recipeId} = this.props
        this.setState({isSelecting: false})
        sepalMap.getContext(recipeId).clearClickListeners()
    }

    setChartPixel(latLng) {
        this.setState({isSelecting: false})
        this.recipeActions.setChartPixel(latLng)
    }
}

ChartPixelButton.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default compose(
    ChartPixelButton,
    withRecipe(mapRecipeToProps)
)
