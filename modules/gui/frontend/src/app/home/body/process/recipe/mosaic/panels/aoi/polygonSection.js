import {RecipeActions} from 'app/home/body/process/recipe/mosaic/mosaicRecipe'
import {compose} from 'compose'
import {isRecipeOpen} from 'app/home/body/process/recipe'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import {withMap} from 'app/home/map/mapContext'
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
        const {map, inputs: {polygon}} = this.props
        // TODO: Show labels?
        // this.recipeActions.setLabelsShown(map, true).dispatch()
        map.drawPolygon('aoi', drawnPolygon => {
            polygon.set(drawnPolygon)
        })
    }

    componentWillUnmount() {
        const {map} = this.props
        this.disableDrawingMode()
        if (isRecipeOpen(this.props.recipeId)) {
            this.recipeActions.setLabelsShown(map, this.wereLabelsShown).dispatch()
        }
    }

    disableDrawingMode() {
        const {map} = this.props
        map.disableDrawingMode()
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

        const {map, inputs: {polygon}, layerIndex, componentWillUnmount$} = this.props
        setAoiLayer({
            map,
            aoi: {
                type: 'POLYGON',
                path: polygon.value
            },
            fill: true,
            destroy$: componentWillUnmount$,
            onInitialized: () => map.fitLayer('aoi'),
            layerIndex
        })
    }

}

export const PolygonSection = compose(
    _PolygonSection,
    withRecipe(mapRecipeToProps),
    withMap()
)

PolygonSection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired,
    labelsShown: PropTypes.any
}
