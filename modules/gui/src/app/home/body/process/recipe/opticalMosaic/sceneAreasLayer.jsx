import PropTypes from 'prop-types'
import React from 'react'

import {SceneSelectionType} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {MapLayer} from '~/app/home/map/mapLayer'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {withActivators} from '~/widget/activation/activator'
import {enabled} from '~/widget/enableWhen'

import {SceneAreaMarker} from './sceneAreaMarker'
import styles from './sceneAreasLayer.module.css'

const mapRecipeToProps = recipe => {
    const sceneSelectionType = selectFrom(recipe, 'model.sceneSelectionOptions.type')
    const manualSelection = sceneSelectionType === SceneSelectionType.SELECT
    return {
        recipeId: recipe.id,
        initialized: selectFrom(recipe, 'ui.initialized'),
        sceneAreas: selectFrom(recipe, 'ui.sceneAreas'),
        selectedScenes: selectFrom(recipe, ['model.scenes']) || [],
        loading: selectFrom(recipe, 'ui.autoSelectingScenes'),
        manualSelection
    }
}

class _SceneAreasLayer extends React.Component {
    render() {
        const {sceneAreas} = this.props
        return sceneAreas
            ? this.renderSceneAreas()
            : null
    }

    renderSceneAreaMarker(sceneArea) {
        const {recipeId, map, activator: {activatables: {sceneSelection}}, selectedScenes, loading} = this.props
        const selectedSceneCount = (selectedScenes[sceneArea.id] || []).length
        return (
            <SceneAreaMarker
                key={sceneArea.id}
                recipeId={recipeId}
                sceneAreaId={sceneArea.id}
                polygon={sceneArea.polygon}
                selectedSceneCount={selectedSceneCount}
                loading={loading}
                sceneSelection={sceneSelection}
                map={map}
            />
        )
    }

    renderSceneAreas() {
        const {sceneAreas, map} = this.props
        if (sceneAreas)
            return (
                <MapLayer className={styles.sceneAreas} map={map}>
                    {sceneAreas.map(sceneArea => this.renderSceneAreaMarker(sceneArea))}
                </MapLayer>
            )
        else
            return null
    }
}

export const SceneAreasLayer = compose(
    _SceneAreasLayer,
    enabled({when: ({manualSelection}) => manualSelection}),
    withActivators('sceneSelection'),
    withRecipe(mapRecipeToProps)
)

SceneAreasLayer.propTypes = {
    recipeId: PropTypes.string
}
