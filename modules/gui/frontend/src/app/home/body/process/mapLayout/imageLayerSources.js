import {Padding} from 'widget/padding'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {SuperButton} from 'widget/superButton'
import {compose} from 'compose'
import {msg} from 'translate'
import {removeArea} from './layerAreas'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './imageLayerSources.module.css'

const mapRecipeToProps = recipe => {
    return {
        sources: selectFrom(recipe, 'ui.imageLayerSources')
    }
}

export class _ImageLayerSources extends React.Component {
    render() {
        const {sources} = this.props
        return (
            <ScrollableContainer>
                <Scrollable>
                    <Padding noHorizontal>
                        {sources.map(source => this.renderSource(source))}
                    </Padding>
                </Scrollable>
            </ScrollableContainer>
        )
    }

    renderSource(source) {
        const {drag$} = this.props
        return source && source.id
            ? (
                <SuperButton
                    key={source.id}
                    title={source.type} // TODO: Use message key
                    description={source.description}
                    removeMessage={msg('map.layout.layer.remove.message')}
                    removeTooltip={msg('map.layout.layer.remove.tooltip')}
                    drag$={drag$}
                    dragValue={source.id}
                    // onRemove={() => this.removeSource(source.id)}
                />
            )
            : null
    }

    // componentDidMount() {
    //     const {layers, recipeActionBuilder} = this.props
    //     recipeActionBuilder('SAVE_LAYERS')
    //         .set('map.layers', layers)
    //         .dispatch()
    // }

    // removeSource(sourceId) {
    //     const {areas, recipeActionBuilder} = this.props
    //     const removeAreaByLayer = (areas, layerId) => {
    //         const area = _.chain(areas)
    //             .pickBy(areaLayerId => areaLayerId === layerId)
    //             .keys()
    //             .first()
    //             .value()
    //         return area
    //             ? removeAreaByLayer(removeArea({areas, area}), layerId)
    //             : areas
    //     }
    //     recipeActionBuilder('REMOVE_LAYER')
    //         .del(['map.layers', {id: sourceId}])
    //         .set('map.areas', removeAreaByLayer(areas, sourceId))
    //         .dispatch()
    // }
}

export const ImageLayerSources = compose(
    _ImageLayerSources,
    withRecipe(mapRecipeToProps)
)

ImageLayerSources.propTypes = {
    drag$: PropTypes.object
}
