import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {Msg} from 'translate'
import {sepalMap} from '../../../../../map/map'
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
        this.whereLabelsShown = props.labelsShown
        this.recipeActions = new RecipeActions(props.recipeId)
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
        this.recipeActions.setLabelsShown(this.whereLabelsShown).dispatch()
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
                type: 'polygon',
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
    recipeId: PropTypes.string.isRequired,
    inputs: PropTypes.object.isRequired
}

export default connect(mapStateToProps)(PolygonSection)