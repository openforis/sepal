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
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {Notifications} from '~/widget/notifications'
import {PortalContainer} from '~/widget/portal'
import {TabContext} from '~/widget/tabs/tabContext'

import {MapAreaContext} from '../mapAreaContext'
import {toVisualizations} from './assetVisualizationParser'

const {assetMetadata$, preview$, assetVersions$} = vi.hoisted(() => ({
    assetMetadata$: vi.fn(), preview$: vi.fn(), assetVersions$: vi.fn()
}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {assetMetadata$, preview$, assetVersions$},
    recipe: {loadAll$: () => NEVER, load$: () => NEVER}
}}))
vi.mock('~/translate', () => ({msg: key => key}))
// Only map/menu placement and unrelated overlays are omitted. The layer, selector, Combo, Redux, the source runtime that
// keeps the asset's evidence, MapAreaLayout and EarthEngineImageLayer request/cancellation path are real.
vi.mock('~/widget/split/splitOverlay', () => ({SplitOverlay: ({children}) => children}))
vi.mock('../mapAreaMenu', () => ({MapAreaMenu: ({form}) => form}))
vi.mock('../featureLayers', () => ({FeatureLayers: () => null}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, remoteMetadata, remoteVersion, activePreviews

beforeEach(() => {
    vi.spyOn(Notifications, 'error').mockImplementation(() => {})
    assetMetadata$.mockReset().mockImplementation(() => of(remoteMetadata))
    remoteVersion = 'original'
    // The token Earth Engine reports for the asset now, answered at once.
    assetVersions$.mockReset().mockImplementation(({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: remoteVersion}))}))
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

describe('a check of the asset', () => {
    it('finding it missing withholds the layer and names the asset, and finding it again draws it again', async () => {
        remoteMetadata = metadata(['red'])
        const selected = openLayer()
        expect(activePreviews).toBe(1)

        assetVersions$.mockImplementationOnce(({ids}) => of({assets: ids.map(id => ({id, failure: {kind: 'DEFINITIVE', code: 'NOT_FOUND'}}))}))
        await catalogue([])

        expect(activePreviews).toBe(0)
        expect(labelWarnings()).toBe(1)
        expect(selection()).toEqual(selected)
        await catalogue([{id: assetId, type: 'Image', updateTime: 'original'}])

        expect(activePreviews).toBe(1)
        expect(labelWarnings()).toBe(0)
    })

    it('under replaced credentials reads its metadata again and keeps what is drawn, though drawn after a change', async () => {
        remoteMetadata = metadata(['red'])
        openLayer()
        await signalAssetChange('changed')
        expect(preview$).toHaveBeenCalledTimes(2)

        await act(async () => actionBuilder('CREDENTIALS').set('user.currentUser.googleTokens', {accessToken: 'renewed'}).dispatch())

        expect(assetMetadata$).toHaveBeenCalledTimes(3)
        expect(preview$).toHaveBeenCalledTimes(2)
        expect(activePreviews).toBe(1)
    })

    it('that cannot reach Earth Engine keeps what is drawn and says so', async () => {
        remoteMetadata = metadata(['red'])
        openLayer()

        assetVersions$.mockImplementationOnce(() => throwError(() => new Error('Service unavailable')))
        await catalogue([{id: assetId, type: 'Image', updateTime: 'unreachable'}])

        expect(activePreviews).toBe(1)
        expect(preview$).toHaveBeenCalledTimes(1)
        expect(labelWarnings()).toBe(1)
    })
})

const assetId = 'projects/test/assets/slice'
const metadata = (bandNames, presetBands = bandNames) => ({
    type: 'Image', id: assetId, bandNames,
    bands: bandNames.map(id => ({id, data_type: {type: 'PixelType', precision: 'float'}})),
    properties: Object.fromEntries(presetBands.flatMap((band, i) => [
        [`visualization_${i}_type`, 'continuous'],
        [`visualization_${i}_bands`, band],
        [`visualization_${i}_min`, '0'],
        [`visualization_${i}_max`, '1']
    ]))
})

const selection = () => store.getState().process.loadedRecipes.map.layers.areas.main.imageLayer.layerConfig.visParams
const previewBands = () => preview$.mock.calls.map(([{visParams}]) => visParams.bands)

// The asset changes, and the asset catalogue lists its new updateTime.
const signalAssetChange = updateTime => act(async () => {
    remoteVersion = updateTime
    actionBuilder('LOAD_ASSETS')
        .set('assets.user', [{id: assetId, type: 'Image', updateTime}])
        .dispatch()
})

const catalogue = assets => act(async () => actionBuilder('LOAD_ASSETS').set('assets.user', assets).dispatch())

// Problems with the sources are shown on the selector's label, with what they are in a tooltip.
const labelWarnings = () => container.querySelectorAll('[data-icon="triangle-exclamation"]').length

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
            <SourceRuntimeProvider>
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
            </SourceRuntimeProvider>
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
