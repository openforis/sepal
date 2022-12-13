import {RecipeActions} from './classificationRecipe'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withActivator} from 'widget/activation/activator'
import {withDataCollectionContext} from './dataCollectionManager'
import {withRecipe} from 'app/home/body/process/recipeContext'
import MarkerClustererLayer from 'app/home/map/markerClustererLayer'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    legend: selectFrom(recipe, 'model.legend'),
    trainingDataSets: selectFrom(recipe, 'model.trainingData.dataSets'),
    prevPoint: selectFrom(recipe, 'ui.collect.point'),
    collecting: selectFrom(recipe, 'ui.collect.collecting'),
    countPerClass: selectFrom(recipe, 'ui.collect.countPerClass')
})

class ReferenceDataLayer extends React.Component {
    state = {clickListener: null}
    constructor(props) {
        super(props)
        const {recipeId, map, dataCollectionManager} = props
        this.layer = new MarkerClustererLayer({
            map,
            id: 'referenceData',
            label: msg('process.classification.layers.referenceData.label'),
            description: msg('process.classification.layers.referenceData.description')
        })
        dataCollectionManager.addListener({
            onSelect: point => this.onSelect(this.toMarker(point)),
            onDeselect: point => this.onDeselect(point),
            onAdd: point => this.onAdd(point),
            onUpdate: (point, prevValue) => this.onUpdate(point, prevValue),
            onRemove: point => this.onRemove(point),
            onUpdateAll: () => this.updateAllMarkers()
        })
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        return null
    }

    componentDidMount() {
        const {collecting, map} = this.props
        this.updateAllMarkers()
        map.setLayer({id: 'referenceData', layer: this.layer})
        if (collecting) {
            this.addMapListener()
        }
    }

    componentDidUpdate(prevProps) {
        this.handleCollectingChange(prevProps.collecting)
    }

    componentWillUnmount() {
        this.clearMapListeners()
        const {map} = this.props
        map.removeLayer(this.layer.id)
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
        const {map, dataCollectionManager} = this.props
        const clickListener = map.addClickListener(
            ({lat, lng}) => dataCollectionManager.add({x: lng, y: lat}, this.props.prevPoint)
        )
        this.setState({clickListener})
    }

    clearMapListeners() {
        const {clickListener} = this.state
        clickListener && clickListener.remove()
        this.setState({clickListener: null})
    }

    updateAllMarkers() {
        const referenceData = this.getReferenceData()
        const countPerClass = {}
        const markers = referenceData
            .map(point => {
                const pointClass = point['class']
                countPerClass[pointClass] = (countPerClass[pointClass] || 0) + 1
                return this.toMarker(point)
            })
        this.updateCountPerClass(countPerClass)
        this.layer.setMarkers(markers)
    }

    onSelect(marker) {
        this.layer.selectMarker(marker)
    }

    onDeselect(point) {
        this.layer.deselectMarker(this.toMarker(point))
        if (!isClassified(point)) {
            this.layer.removeMarker(this.toMarker(point))
        }
    }

    onAdd(point) {
        const marker = this.toMarker(point)
        this.layer.addMarker(marker)
        if (isClassified(point)) {
            this.incrementCount(point)
        }
    }

    onUpdate(point, prevValue) {
        const {countPerClass} = this.props
        const pointClass = point['class']
        if (_.isFinite(prevValue))
            countPerClass[prevValue] = (countPerClass[prevValue] || 0) - 1
        countPerClass[pointClass] = (countPerClass[pointClass] || 0) + 1
        this.updateCountPerClass(countPerClass)
        this.layer.updateMarker(this.toMarker(point))
    }

    onRemove(point) {
        this.layer.removeMarker(this.toMarker(point))
        this.decrementCount(point)
    }

    updateCountPerClass(countPerClass) {
        this.recipeActions.setCountPerClass(countPerClass)
    }

    incrementCount(point) {
        const {countPerClass} = this.props
        const pointClass = point['class']
        countPerClass[pointClass] = (countPerClass[pointClass] || 0) + 1
        this.updateCountPerClass(countPerClass)
    }

    decrementCount(point) {
        const {countPerClass} = this.props
        const pointClass = point['class']
        countPerClass[pointClass] = (countPerClass[pointClass] || 0) - 1
        this.updateCountPerClass(countPerClass)
    }

    toMarker(point) {
        const {legend, dataCollectionManager} = this.props
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
            onClick: marker => dataCollectionManager.select(marker, this.props.prevPoint)
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
    dataCollectionManager: PropTypes.object.isRequired,
    recipeId: PropTypes.string,
}

export default compose(
    ReferenceDataLayer,
    withRecipe(mapRecipeToProps),
    withDataCollectionContext(),
    withActivator('collect')
)
