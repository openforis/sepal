import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import api from '~/apiRegistry'
import {
    getSource,
    RecipeActions,
    SceneSelectionType} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {isPartiallyEqual} from '~/hash'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {Notifications} from '~/widget/notifications'
import {withTab} from '~/widget/tabs/tabContext'

const mapRecipeToProps = recipe => ({
    manualSelection: selectFrom(recipe, 'model.sceneSelectionOptions.type') === SceneSelectionType.SELECT,
    aoi: selectFrom(recipe, 'model.aoi'),
    source: getSource(recipe),
    sources: selectFrom(recipe, 'ui.featureLayerSources') || [],
    areas: selectFrom(recipe, 'layers.areas') || {},
    sceneAreas: selectFrom(recipe, 'ui.sceneAreas') || [],
})

class _SceneAreas extends React.Component {
    loadSceneArea$ = new Subject()

    render() {
        return null
    }

    componentDidMount() {
        const {aoi, source, manualSelection} = this.props
        if (manualSelection) {
            this.loadSceneAreas(aoi, source)
        }
        this.toggleLayer(manualSelection)
    }

    componentDidUpdate(prevProps) {
        const {stream, sceneAreas, aoi, source, manualSelection} = this.props
        const sceneAreasChanged = !isPartiallyEqual(this.props, prevProps, ['aoi', 'source'])
        if (manualSelection && (sceneAreasChanged || (!sceneAreas.length && !stream('LOAD_SCENE_AREAS').active))) {
            this.loadSceneAreas(aoi, source)
        }
        this.toggleLayer(manualSelection)
    }
    
    componentWillUnmount() {
        this.toggleLayer(false)
    }

    loadSceneAreas(aoi, source) {
        const {recipeId, stream, tab: {busy}} = this.props
        RecipeActions(recipeId).setSceneAreas(null).dispatch()
        this.loadSceneArea$.next()
        const busyId = `SceneAreas-${recipeId}`
        busy.set(busyId, true)
        stream('LOAD_SCENE_AREAS',
            api.gee.sceneAreas$({aoi, source}).pipe(
                takeUntil(this.loadSceneArea$)
            ),
            sceneAreas => {
                RecipeActions(recipeId).setSceneAreas(sceneAreas).dispatch()
                busy.set(busyId, false)
            },
            error => {
                busy.set(busyId, false)
                Notifications.error({
                    title: msg('gee.error.title'),
                    message: msg('process.mosaic.sceneAreas.error'),
                    error: error.response ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage) : null,
                    group: true,
                    timeout: 0
                })
            }
        )
    }

    toggleLayer(include) {
        const {sources} = this.props
        const included = !!sources.find(({type}) => type === 'SceneAreas')
        if (include && !included) {
            this.includeLayer()
        } else if (!include && included) {
            this.removeLayer()
        }
    }

    removeLayer() {
        const {areas, sources, recipeActionBuilder} = this.props
        const source = sources.find(({type}) => type === 'SceneAreas') || {}
        Object.keys(areas)
            .reduce(
                (actionBuilder, area) => actionBuilder
                    .del(['layers.areas', area, 'featureLayers', {sourceId: source.id}]),
                recipeActionBuilder('REMOVE_SCENE_AREA_FEATURE_LAYER')
            )
            .del(['ui.featureLayerSources', {type: 'SceneAreas'}])
            .del('ui.sceneAreas')
            .dispatch()
    }

    includeLayer() {
        const {areas, recipeActionBuilder} = this.props
        const source = {
            id: uuid(),
            type: 'SceneAreas',
            description: msg('featureLayerSources.SceneAreas.description')
        }
        const layer = {sourceId: source.id}
        Object.keys(areas)
            .reduce(
                (actionBuilder, area) => actionBuilder
                    .push(['layers.areas', area, 'featureLayers'], layer),
                recipeActionBuilder('INCLUDE_SCENE_AREA_FEATURE_LAYER')
            )
            .push('ui.featureLayerSources', source)
            .dispatch()
    }
}

export const SceneAreas = compose(
    _SceneAreas,
    withRecipe(mapRecipeToProps),
    withTab()
)

SceneAreas.propTypes = {}
