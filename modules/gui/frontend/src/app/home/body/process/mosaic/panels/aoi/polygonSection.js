import {Msg} from 'translate'
import {RecipeActions, RecipeState, isRecipeOpen} from 'app/home/body/process/mosaic/mosaicRecipe'
import {connect} from 'store'
import {sepalMap} from '../../../../../map/map'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './aoi.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        labelsShown: recipeState('ui.labelsShown')
    }
}

class PolygonSection extends React.Component {
    constructor(props) {
        super(props)
        this.wereLabelsShown = props.labelsShown
        this.recipeActions = RecipeActions(props.recipeId)
    }

    componentDidMount() {
        const {recipeId, inputs: {polygon}} = this.props

        this.recipeActions.setLabelsShown(true).dispatch()
        sepalMap.getContext(recipeId).drawPolygon('aoi', (drawnPolygon) => {
            polygon.set(drawnPolygon)
        })
    }

    componentWillUnmount() {
        this.disableDrawingMode()
        if (isRecipeOpen(this.props.recipeId))
            this.recipeActions.setLabelsShown(this.wereLabelsShown).dispatch()
    }

    disableDrawingMode() {
        const {recipeId} = this.props
        sepalMap.getContext(recipeId).disableDrawingMode()
    }

    updateBounds(updatedBounds) {
        const {recipeId, inputs: {bounds}} = this.props
        bounds.set(updatedBounds)
        sepalMap.getContext(recipeId).fitLayer('aoi')
    }

    render() {
        return (
            <React.Fragment>
                <div className={styles.polygon}>
                    <Msg id='process.mosaic.panel.areaOfInterest.form.polygon.description'/>
                </div>
            </React.Fragment>
        )
    }

    componentDidUpdate(prevProps) {
        if (prevProps.inputs === this.props.inputs)
            return

        const {recipeId, inputs: {polygon, bounds}, componentWillUnmount$} = this.props
        setAoiLayer({
            contextId: recipeId,
            aoi: {
                type: 'POLYGON',
                path: polygon.value,
                bounds: bounds.value
            },
            fill: true,
            destroy$: componentWillUnmount$,
            onInitialized: (layer) => this.updateBounds(layer.bounds)
        })
    }

}

PolygonSection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired,
    labelsShown: PropTypes.any
}

export default connect(mapStateToProps)(PolygonSection)
