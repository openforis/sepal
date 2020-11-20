import {compose} from 'compose'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import React from 'react'
import MarkerClustererLayer from '../../../../map/markerClustererLayer'
import {msg} from 'translate'

const mapRecipeToProps = recipe => ({
    legend: selectFrom(recipe, 'model.legend'),
    trainingDataSets: selectFrom(recipe, 'model.trainingData.dataSets')
})

class ReferenceDataLayer extends React.Component {
    constructor(props) {
        super(props)
        const {mapContext} = props
        this.layer = new MarkerClustererLayer({
            mapContext,
            id: 'referenceData',
            label: msg('process.classification.layers.referenceData.label'),
            description: msg('process.classification.layers.referenceData.description'),
        })
    }

    render() {
        return null
    }

    componentDidMount() {
        const {mapContext: {sepalMap}, componentWillUnmount$} = this.props

        this.updateMarkers()
        sepalMap.setLayer({
            id: 'referenceData',
            layer: this.layer,
            destroy$: componentWillUnmount$
        })
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        const {trainingDataSets} = this.props
        if (prevProps.trainingDataSets !== trainingDataSets) {
            this.updateMarkers()
        }
    }

    updateMarkers() {
        const {legend, trainingDataSets} = this.props
        const referenceData = trainingDataSets
            .filter(({type}) => type !== 'RECIPE')
            .map(({referenceData}) => referenceData)

        const markers = referenceData
            .flat()
            .map(point => ({
                x: point.x,
                y: point.y,
                color: legend.entries.find(({value}) => `${value}` === `${point['class']}`).color,
                onClick: () => this.onSelect(point)
            }))
        this.layer.setMarkers(markers)
    }

    onSelect(point) {
        // TODO: Open panel
    }
}

export default compose(
    ReferenceDataLayer,
    withRecipe(mapRecipeToProps)
)
