import {
    RecipeActions,
    SceneSelectionType,
    getSource
} from 'app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {Subject, takeUntil} from 'rxjs'
import {compose} from 'compose'
import {msg} from 'translate'
import {objectEquals} from 'collections'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {withTab} from 'widget/tabs/tabContext'
import Notifications from 'widget/notifications'
import React from 'react'
import api from 'api'
import guid from 'guid'

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
        const sceneAreasChanged = !objectEquals(this.props, prevProps, ['aoi', 'source'])
        if (manualSelection && (sceneAreasChanged || (!sceneAreas.length && !stream('LOAD_SCENE_AREAS').active))) {
            this.loadSceneAreas(aoi, source)
        }
        this.toggleLayer(manualSelection)
    }
    
    componentWillUnmount() {
        this.toggleLayer(false)
    }

    loadSceneAreas(aoi, source) {
        const {recipeId, stream, tab: {busy$}} = this.props
        RecipeActions(recipeId).setSceneAreas(null).dispatch()
        this.loadSceneArea$.next()
        busy$.next(true)
        stream('LOAD_SCENE_AREAS',
            api.gee.sceneAreas$({aoi, source}).pipe(
                takeUntil(this.loadSceneArea$)
            ),
            sceneAreas => {
                RecipeActions(recipeId).setSceneAreas(sceneAreas).dispatch()
                busy$.next(false)
            },
            e => {
                busy$.next(false)
                Notifications.error({
                    title: msg('gee.error.title'),
                    message: msg('process.mosaic.sceneAreas.error'),
                    error: e.response ? msg(e.response.messageKey, e.response.messageArgs, e.response.defaultMessage) : null,
                    group: true,
                    timeout: 0
                    // content: dismiss =>
                    //     <Button
                    //         look='transparent'
                    //         shape='pill'
                    //         icon='sync'
                    //         label={msg('button.retry')}
                    //         onClick={() => {
                    //             dismiss()
                    //             this.reload()
                    //         }}
                    //     />
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
            id: guid(),
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
    // withDiff(),
    withRecipe(mapRecipeToProps),
    withTab()
)

SceneAreas.propTypes = {}
