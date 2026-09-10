import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {defer, finalize, NEVER, of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {getImageLayerSource} from '~/app/home/body/process/imageLayerSourceRegistry'
import {registerImageLayerSources} from '~/app/home/body/process/imageLayerSources'
import {Recipe, withRecipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {Notifications} from '~/widget/notifications'
import {PortalContainer} from '~/widget/portal'
import {TabContext} from '~/widget/tabs/tabContext'

import {MapAreaContext} from '../mapAreaContext'
import {toVisualizations} from './assetVisualizationParser'

const {assetMetadata$, preview$} = vi.hoisted(() => ({assetMetadata$: vi.fn(), preview$: vi.fn()}))
vi.mock('~/apiRegistry', () => ({default: {gee: {assetMetadata$, preview$}}}))
vi.mock('~/translate', () => ({msg: key => key}))
// Only map/menu placement and unrelated overlays are omitted. The layer, selector, Combo, Redux,
// MapAreaLayout and EarthEngineImageLayer request/cancellation path are real.
vi.mock('~/widget/split/splitOverlay', () => ({SplitOverlay: ({children}) => children}))
vi.mock('../mapAreaMenu', () => ({MapAreaMenu: ({form}) => form}))
vi.mock('../featureLayers', () => ({FeatureLayers: () => null}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, remoteMetadata, activePreviews

beforeEach(() => {
    vi.spyOn(Notifications, 'error').mockImplementation(() => {})
    assetMetadata$.mockReset().mockImplementation(() => of(remoteMetadata))
    activePreviews = 0
    preview$.mockReset().mockImplementation(() => defer(() => {
        activePreviews++
        return NEVER.pipe(finalize(() => activePreviews--))
    }))
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

describe('an asset replaced while its Map Layers layer stays open', () => {
    it('refreshes bands and presets and retains an unchanged preset selection', async () => {
        remoteMetadata = metadata(['red', 'old'])
        const selected = openLayer()
        expect(previewBands()).toEqual([['red']])
        expect(activePreviews).toBe(1)

        remoteMetadata = metadata(['red', 'new', 'array'], ['red', 'old', 'new', 'array'])
        remoteMetadata.bands.find(({id}) => id === 'array').data_type.dimensions = 1
        await signalAssetChange('replacement')

        expect(assetMetadata$).toHaveBeenCalledTimes(2)
        expect(previewBands()).toEqual([['red'], ['red']])
        expect(selection()).toEqual(selected)
        expect(activePreviews).toBe(1)
        expect(await offeredBands()).toEqual(['red', 'new'])

        await chooseBand('new')
        expect(previewBands()).toEqual([['red'], ['red'], ['new']])
    })

    it('renews the preview on a change signal even when metadata and bands are identical', async () => {
        remoteMetadata = metadata(['red'])
        const selected = openLayer()
        expect(preview$).toHaveBeenCalledTimes(1)

        await signalAssetChange('new-pixels')

        expect(preview$).toHaveBeenCalledTimes(2)
        expect(activePreviews).toBe(1)
        expect(selection()).toEqual(selected)
    })

    it('explicitly refreshes the asset without a catalogue change and shows progress until metadata arrives', async () => {
        remoteMetadata = metadata(['red'])
        const selected = openLayer()
        const pending = new Subject()
        assetMetadata$.mockReturnValueOnce(pending)
        expect(preview$).toHaveBeenCalledTimes(1)

        await act(async () => refreshButton().click())

        expect(assetMetadata$).toHaveBeenCalledTimes(2)
        expect(refreshButton().disabled).toBe(true)
        expect(activePreviews).toBe(0)
        await act(async () => pending.next(remoteMetadata))

        expect(refreshButton().disabled).toBe(false)
        expect(preview$).toHaveBeenCalledTimes(2)
        expect(activePreviews).toBe(1)
        expect(selection()).toEqual(selected)
    })

    it.each(['preset', 'user-defined'])('withholds a missing-band %s selection without erasing it, then restores it', async kind => {
        remoteMetadata = metadata(['red', 'old'])
        const custom = {id: 'custom', type: 'continuous', bands: ['old'], min: [0], max: [10], userDefined: true}
        const selected = openLayer({custom: kind === 'user-defined' ? custom : undefined, selectedBand: 'old'})
        expect(previewBands()).toEqual([['old']])

        remoteMetadata = metadata(['red', 'new'], ['red', 'old', 'new'])
        await signalAssetChange('replacement')

        expect(activePreviews).toBe(0)
        expect(previewBands()).toEqual([['old']])
        expect(await offeredBands()).toEqual(['red', 'new'])
        expect(selection()).toEqual(selected)
        if (kind === 'user-defined') {
            expect(store.getState().process.loadedRecipes.map.layers.userDefinedVisualizations.asset).toEqual([custom])
        }

        remoteMetadata = metadata(['red', 'old'])
        await signalAssetChange('restored')

        expect(activePreviews).toBe(1)
        expect(previewBands()).toEqual([['old'], ['old']])
        expect(selection()).toEqual(selected)
    })

    it('cancels obsolete metadata reads and cannot install their late answer', async () => {
        remoteMetadata = metadata(['red'])
        openLayer()
        const pending = new Subject()
        let cancelled = false
        assetMetadata$.mockReturnValueOnce(pending.pipe(finalize(() => cancelled = true)))
        await signalAssetChange('pending')
        expect(activePreviews).toBe(0)

        remoteMetadata = metadata(['red', 'new'])
        await signalAssetChange('latest')
        await act(async () => pending.next(metadata(['obsolete'])))

        expect(cancelled).toBe(true)
        expect(await offeredBands()).toEqual(['red', 'new'])
        expect(previewBands()).toEqual([['red'], ['red']])
    })

    it('reports refresh failure and recovers through explicit refresh', async () => {
        remoteMetadata = metadata(['red'])
        const selected = openLayer()
        assetMetadata$.mockReturnValueOnce(throwError(() => new Error('unavailable')))

        await signalAssetChange('unavailable')

        expect(activePreviews).toBe(0)
        expect(await offeredBands()).toEqual(['widget.list.noResults'])
        expect(selection()).toEqual(selected)
        expect(Notifications.error).toHaveBeenCalledWith(expect.objectContaining({message: 'imageLayerSources.Asset.refresh.failed'}))

        await act(async () => refreshButton().click())

        expect(previewBands()).toEqual([['red'], ['red']])
        expect(selection()).toEqual(selected)
    })
})

const assetId = 'projects/test/assets/slice'
const metadata = (bandNames, presetBands = bandNames) => ({
    type: 'Image', id: assetId, bandNames,
    bands: bandNames.map(id => ({id, data_type: {precision: 'float'}})),
    properties: Object.fromEntries(presetBands.flatMap((band, i) => [
        [`visualization_${i}_type`, 'continuous'],
        [`visualization_${i}_bands`, band],
        [`visualization_${i}_min`, '0'],
        [`visualization_${i}_max`, '1']
    ]))
})

const selection = () => store.getState().process.loadedRecipes.map.layers.areas.main.imageLayer.layerConfig.visParams
const previewBands = () => preview$.mock.calls.map(([{visParams}]) => visParams.bands)

const signalAssetChange = updateTime => act(async () => actionBuilder('LOAD_ASSETS')
    .set('assets.user', [{id: assetId, type: 'Image', updateTime}])
    .dispatch())

const refreshButton = () => container.querySelector('[data-icon="rotate"]').closest('button')

const offeredBands = async () => {
    await act(async () => container.querySelector('input').click())
    return optionElements().map(option => option.textContent)
}

const optionElements = () => [...container.querySelectorAll('li')]
    .filter(option => !option.className.includes('sticky'))
    .map(option => option.firstElementChild)

const chooseBand = band => act(async () => {
    const option = optionElements().find(option => option.textContent === band)
    expect(option).toBeDefined()
    option.click()
})

const SelectedLayer = withRecipe(recipe => ({recipe}))(({recipe, map}) => {
    const {sourceId, layerConfig} = recipe.layers.areas.main.imageLayer
    const source = recipe.layers.additionalImageLayerSources.find(({id}) => id === sourceId)
    return getImageLayerSource({recipe, source, layerConfig, map}).layerComponent
})

const openLayer = ({custom, selectedBand = 'red'} = {}) => {
    const visualizations = toVisualizations(remoteMetadata.properties, remoteMetadata.bandNames)
        .map((visualization, i) => ({...visualization, id: `preset-${i}`}))
    const selected = custom || visualizations.find(({bands}) => bands[0] === selectedBand)
    const initialState = {
        dimensions: {width: 1024, height: 768},
        assets: {user: [{id: assetId, type: 'Image', updateTime: 'original'}]},
        process: {loadedRecipes: {map: {
            id: 'map', type: 'CCDC_SLICE', model: {},
            layers: {
                additionalImageLayerSources: [{id: 'asset', type: 'Asset', sourceConfig: {asset: assetId, metadata: remoteMetadata, visualizations}}],
                userDefinedVisualizations: {asset: custom ? [custom] : []},
                areas: {main: {imageLayer: {sourceId: 'asset', layerConfig: {visParams: selected}}, featureLayers: []}}
            }
        }}, tabs: [{id: 'map'}], recipes: []}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    registerImageLayerSources()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const map = mapPort()
    const mapArea = {
        area: 'main',
        updateLayerConfig: config => actionBuilder('SET_LAYER_CONFIG')
            .merge('process.loadedRecipes.map.layers.areas.main.imageLayer.layerConfig', config).dispatch()
    }
    act(() => root.render(
        <Provider store={store}>
            <PortalContainer/>
            <EventShield>
                <Recipe id='map'>
                    <TabContext id='map' busyIn$={new Subject()} busyOut$={new Subject()}>
                        <MapAreaContext mapArea={mapArea}>
                            <SelectedLayer map={map}/>
                        </MapAreaContext>
                    </TabContext>
                </Recipe>
            </EventShield>
        </Provider>
    ))
    return selected
}

// The map port owns layer replacement. Preview requests stay pending at the remote boundary, so no
// Google tile renderer is needed and removing a layer exercises real request cancellation.
const mapPort = () => {
    const layers = new Map()
    return {
        setLayer({id, layer}) {
            if (!layers.get(id)?.equals(layer)) {
                this.removeLayer(id)
                layers.set(id, layer)
                layer.add()
            }
        },
        removeLayer(id) {
            layers.get(id)?.remove()
            layers.delete(id)
        }
    }
}
