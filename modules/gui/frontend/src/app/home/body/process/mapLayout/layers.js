import {Padding} from 'widget/padding'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {SuperButton} from 'widget/superButton'
import {compose} from 'compose'
import {msg} from 'translate'
import {removeArea} from './layerAreas'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './layers.module.css'

const mapRecipeToProps = recipe => {
    const map = recipe.map || {}
    return {
        layers: map.layers || [],
        areas: map.areas || {}
    }
}

export class _Layers extends React.Component {
    render() {
        const {layers} = this.props
        return (
            <ScrollableContainer>
                <Scrollable className={styles.layers}>
                    <Padding noHorizontal>
                        {layers.map(layer => this.renderLayer(layer))}
                    </Padding>
                </Scrollable>
            </ScrollableContainer>
        )
    }

    renderLayer(layer) {
        const {drag$} = this.props
        return layer && layer.id
            ? (
                <SuperButton
                    key={layer.id}
                    title={layer.type}
                    description={layer.id.substr(-8)}
                    removeMessage={msg('map.layout.layer.remove.message')}
                    removeTooltip={msg('map.layout.layer.remove.tooltip')}
                    drag$={drag$}
                    dragValue={layer.id}
                    onRemove={() => this.removeLayer(layer.id)}
                />
            )
            : null
    }

    componentDidMount() {
        const {layers, recipeActionBuilder} = this.props
        recipeActionBuilder('SAVE_LAYERS')
            .set('map.layers', layers)
            .dispatch()
    }

    removeLayer(layerId) {
        const {areas, recipeActionBuilder} = this.props
        const removeAreaByLayer = (areas, layerId) => {
            const area = _.chain(areas)
                .pickBy(areaLayerId => areaLayerId === layerId)
                .keys()
                .first()
                .value()
            return area
                ? removeAreaByLayer(removeArea({areas, area}), layerId)
                : areas
        }
        recipeActionBuilder('REMOVE_LAYER')
            .del(['map.layers', {id: layerId}])
            .set('map.areas', removeAreaByLayer(areas, layerId))
            .dispatch()
    }
}

export const Layers = compose(
    _Layers,
    withRecipe(mapRecipeToProps)
)

Layers.propTypes = {
    drag$: PropTypes.object
}
