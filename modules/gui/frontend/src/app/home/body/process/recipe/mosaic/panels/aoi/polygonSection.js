import {RecipeActions} from 'app/home/body/process/recipe/mosaic/mosaicRecipe'
import {compose} from 'compose'
import {isRecipeOpen} from 'app/home/body/process/recipe'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './polygonSection.module.css'

const mapRecipeToProps = recipe => {
    return {
        recipeId: recipe.id,
        labelsShown: selectFrom(recipe, 'ui.labelsShown')
    }
}

class _PolygonSection extends React.Component {
    constructor(props) {
        super(props)
        this.wereLabelsShown = props.labelsShown
        this.recipeActions = RecipeActions(props.recipeId)
    }

    componentDidMount() {
        const {mapContext, inputs: {polygon}} = this.props
        this.recipeActions.setLabelsShown(mapContext, true).dispatch()
        mapContext.sepalMap.drawPolygon('aoi', drawnPolygon => {
            polygon.set(drawnPolygon)
        })
    }

    componentWillUnmount() {
        const {mapContext} = this.props
        this.disableDrawingMode()
        if (isRecipeOpen(this.props.recipeId)) {
            this.recipeActions.setLabelsShown(mapContext, this.wereLabelsShown).dispatch()
        }
    }

    disableDrawingMode() {
        const {mapContext: {sepalMap}} = this.props
        sepalMap.disableDrawingMode()
    }

    render() {
        return (
            <div className={styles.polygon}>
                {msg('process.mosaic.panel.areaOfInterest.form.polygon.description')}
            </div>
        )
    }

    componentDidUpdate(prevProps) {
        if (prevProps.inputs === this.props.inputs) {
            return
        }

        const {mapContext, inputs: {polygon}, layerIndex, componentWillUnmount$} = this.props
        setAoiLayer({
            mapContext,
            aoi: {
                type: 'POLYGON',
                path: polygon.value
            },
            fill: true,
            destroy$: componentWillUnmount$,
            onInitialized: () => mapContext.sepalMap.fitLayer('aoi'),
            layerIndex
        })
    }

}

export const PolygonSection = compose(
    _PolygonSection,
    withRecipe(mapRecipeToProps)
)

PolygonSection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired,
    labelsShown: PropTypes.any
}
