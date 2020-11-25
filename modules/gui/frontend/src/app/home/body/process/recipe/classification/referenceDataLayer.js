import {compose} from 'compose'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import React from 'react'
import MarkerClustererLayer from '../../../../map/markerClustererLayer'
import {msg} from 'translate'
import {activator} from 'widget/activation/activator'
import {RecipeActions} from './classificationRecipe'
import PropTypes from 'prop-types'
import _ from 'lodash'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    legend: selectFrom(recipe, 'model.legend'),
    trainingDataSets: selectFrom(recipe, 'model.trainingData.dataSets'),
    prevPoint: selectFrom(recipe, 'ui.collect.point'),
    collecting: selectFrom(recipe, 'ui.collect.collecting')
})

class ReferenceDataLayer extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId, mapContext, dataCollectionEvents} = props
        this.layer = new MarkerClustererLayer({
            mapContext,
            id: 'referenceData',
            label: msg('process.classification.layers.referenceData.label'),
            description: msg('process.classification.layers.referenceData.description')
        })
        dataCollectionEvents.addListener({
            onAdd: point => this.onAdd(point),
            onUpdate: point => this.onUpdate(point),
            onRemove: point => this.onRemove(point),
            onDeselect: point => this.onDeselect(point)
        })
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        return null
    }

    componentDidMount() {
        const {collecting, mapContext: {sepalMap}, componentWillUnmount$} = this.props
        this.updateAllMarkers()
        sepalMap.setLayer({
            id: 'referenceData',
            layer: this.layer,
            destroy$: componentWillUnmount$
        })
        if (collecting) {
            this.addMapListener()
        }
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        const {trainingDataSets} = this.props
        this.handleCollectingChange(prevProps.collecting)
        const changed = () => {
            const prevDataSets = prevProps.trainingDataSets.filter(({type}) => type !== 'COLLECTED')
            const dataSets = this.props.trainingDataSets.filter(({type}) => type !== 'COLLECTED')
            return prevDataSets.length !== dataSets.length
                || dataSets.find(
                    dataSet => dataSet !== prevDataSets.find(({id}) => dataSet.id === id)
                )
        }

        if (prevProps.trainingDataSets !== trainingDataSets && changed()) {
            this.updateAllMarkers()
        }
    }

    componentWillUnmount() {
        this.clearMapListeners()
    }

    handleCollectingChange(prevCollecting) {
        const {collecting} = this.props
        if (prevCollecting === collecting)
            return
        if (collecting) {
            this.addMapListener()
            this.layer.setClickable(true)
        } else {
            this.clearMapListeners()
            this.layer.setClickable(false)
        }
    }

    addMapListener() {
        const {mapContext: {sepalMap}} = this.props
        sepalMap.onClick(({lat: y, lng: x}) => this.onAdd({x, y}))
    }

    clearMapListeners() {
        const {mapContext: {sepalMap}} = this.props
        sepalMap.clearClickListeners()
    }

    updateAllMarkers() {
        const referenceData = this.getReferenceData()
        const markers = referenceData
            .map(point => this.toMarker(point))
        this.layer.setMarkers(markers)
    }

    onSelect(marker) {
        const {prevPoint} = this.props
        if (prevPoint) {
            if (isClassified(marker)) {
                this.layer.deselectMarker(prevPoint)
            } else {
                this.layer.removeMarker(marker)
            }
        }
        this.layer.selectMarker(marker)
        this.recipeActions.setSelectedPoint({x: marker.x, y: marker.y, dataSetId: marker.dataSetId, 'class': marker['class']})
    }

    onDeselect(point) {
        this.layer.deselectMarker(this.toMarker(point))
        this.recipeActions.setSelectedPoint(null)
        if (!isClassified(point)) {
            this.layer.removeMarker(this.toMarker(point))
        }
    }

    onAdd(point) {
        console.log('onAdd', point)
        const {prevPoint} = this.props
        if (prevPoint)
            this.layer.deselectMarker(prevPoint)
        this.layer.addMarker(this.toMarker(point))
        if (isClassified(point))
            this.recipeActions.addSelectedPoint(point)
        else
            this.recipeActions.setSelectedPoint(point)
    }

    onUpdate(point) {
        console.log('onUpdate', point)
        this.layer.updateMarker(this.toMarker(point))
        this.recipeActions.updateSelectedPoint(point)
    }

    onRemove(point) {
        console.log('onRemove', point)
        this.layer.removeMarker(this.toMarker(point))
        this.recipeActions.removeSelectedPoint(point)
    }

    toMarker(point) {
        const {legend} = this.props
        const legendEntry = legend.entries.find(({value}) => `${value}` === `${point['class']}`)
        const additionalProps = legendEntry
            ? {
                color: legendEntry.color,
                'class': legendEntry.value
            }
            : {}
        return {
            x: point.x,
            y: point.y,
            dataSetId: point.dataSetId,
            ...additionalProps,
            onClick: marker => this.onSelect(marker)
        }
    }

    getReferenceData() {
        const {trainingDataSets} = this.props
        return trainingDataSets
            .filter(({type}) => type !== 'RECIPE')
            .map(({dataSetId, referenceData}) =>
                referenceData.map(point => ({...point, dataSetId}))
            )
            .flat()
    }
}

const isClassified = marker => Object.keys(marker).includes('class') && _.isFinite(marker['class'])

ReferenceDataLayer.propTypes = {
    recipeId: PropTypes.string,
    dataCollectionEvents: PropTypes.object.isRequired
}

export default compose(
    ReferenceDataLayer,
    withRecipe(mapRecipeToProps),
    activator('collect')
)
