import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Observable, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'

// The panel's form and the GeoID check, wired as the area of interest panel wires them. The check's own rules
// are specified in geoIdCheck.test.js; this establishes that the form follows them.

const {aoiGeoId$} = vi.hoisted(() => ({aoiGeoId$: vi.fn()}))
vi.mock('~/apiRegistry', () => ({default: {gee: {aoiGeoId$}}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('./previewMap', () => ({PreviewMap: () => null}))
// Cuts an import cycle the form barrel would otherwise enter from the wrong side (see recipeInput.test.jsx).
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))

const {geoIdFields, GeoIdSection} = await import('./geoIdSection')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const OWNER = 'owner'
const GEOID = '40df4325-744f-8fae-8e46-049080be5554'
const OTHER_GEOID = '0b9e6c0a-1d2f-8a3b-9c4d-5e6f7a8b9c0d'
const BOUNDS = [[147.38, -33.51], [147.39, -33.50]]

let root, container, store, form, inputs, lookups

beforeEach(() => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']})
    lookups = []
    aoiGeoId$.mockReset().mockImplementation(request => {
        const lookup = {request, answer$: new Subject(), unsubscribed: false}
        lookups.push(lookup)
        return new Observable(subscriber => {
            const subscription = lookup.answer$.subscribe(subscriber)
            return () => {
                lookup.unsubscribed = true
                subscription.unsubscribe()
            }
        })
    })
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.useRealTimers()
})

describe('the GeoID section of the area of interest form', () => {
    it('blocks Apply while the GeoID is checked, and allows it once the check permits', async () => {
        show({geoId: GEOID})
        expect(form.isInvalid()).toBe(true)

        await answer({geometryType: 'Polygon', bounds: BOUNDS})

        expect(lookups.map(({request}) => request)).toEqual([{id: GEOID, bufferMeters: undefined}])
        expect(form.isInvalid()).toBe(false)
        expect(overlay().featureLayers[0].layerConfig.aoi).toEqual({type: 'GEOID', id: GEOID})
    })

    it('fills in the geometry\'s default without marking an unchanged panel as edited', async () => {
        show({geoId: GEOID})

        await answer({geometryType: 'Polygon', bounds: BOUNDS})

        expect(inputs.bufferMeters.value).toBe(0)
        expect(form.isDirty()).toBe(false)
    })

    it('keeps the buffer visible and editable while checking and after a failed check', async () => {
        show({geoId: GEOID, bufferMeters: 1000})
        expect(bufferField().disabled).toBe(false)

        await fail({errorCode: 'GEOID_UNREACHABLE'})

        expect(bufferField().disabled).toBe(false)
        expect(inputs.bufferMeters.value).toBe(1000)
        expect(form.isInvalid()).toBe(false)
    })

    it('clears the buffer when the GeoID changes, then takes the new geometry\'s default', async () => {
        show({geoId: GEOID, bufferMeters: 1000})
        await answer({geometryType: 'Point', bounds: BOUNDS})

        await act(async () => inputs.geoId.set(OTHER_GEOID))
        expect(inputs.bufferMeters.value).toBe('')

        await answer({geometryType: 'Point', bounds: BOUNDS})
        expect(lookups[1].request).toEqual({id: OTHER_GEOID, bufferMeters: undefined})
        expect(inputs.bufferMeters.value).toBe(250)
    })

    it('releases the check when the section closes', async () => {
        show({geoId: GEOID})
        await act(async () => vi.advanceTimersByTime(1000))

        await act(async () => root.unmount())
        root = null

        expect(lookups[0].unsubscribed).toBe(true)
    })
})

describe('an invalid buffer in the GeoID section', () => {
    it('stays editable with Apply blocked, and cancels the check in progress', async () => {
        show({geoId: GEOID})
        await answer({geometryType: 'Point', bounds: BOUNDS})
        await act(async () => inputs.bufferMeters.set('1000'))
        await act(async () => vi.advanceTimersByTime(1000))

        await act(async () => inputs.bufferMeters.set('1'))
        await act(async () => lookups[1].answer$.next({geometryType: 'Point', bounds: [[0, 0], [1, 1]]}))
        await act(async () => vi.advanceTimersByTime(1000))

        expect(bufferField().disabled).toBe(false)
        expect(form.isInvalid()).toBe(true)
        expect(lookups[1].unsubscribed).toBe(true)
        expect(lookups).toHaveLength(2)
        expect(store.getState().process.loadedRecipes[OWNER].ui.overlay.bounds).toEqual(BOUNDS)
    })

    it('once corrected, is checked again and allows Apply', async () => {
        show({geoId: GEOID})
        await answer({geometryType: 'Point', bounds: BOUNDS})
        await act(async () => inputs.bufferMeters.set('1'))

        await act(async () => inputs.bufferMeters.set('50'))
        await answer({geometryType: 'Point', bounds: BOUNDS})

        expect(lookups[1].request).toEqual({id: GEOID, bufferMeters: 50})
        expect(form.isInvalid()).toBe(false)
    })
})

const overlay = () => store.getState().process.loadedRecipes[OWNER].layers.overlay

const bufferField = () => container.querySelector('input[type="number"]')

const answer = async result => {
    await act(async () => vi.advanceTimersByTime(1000))
    await act(async () => lookups[lookups.length - 1].answer$.next(result))
}

const fail = async response => {
    await act(async () => vi.advanceTimersByTime(1000))
    await act(async () => lookups[lookups.length - 1].answer$.error({status: 502, response}))
}

const fields = {
    section: new Form.Field(),
    ...geoIdFields
}

const Host = withForm({fields})(props => {
    form = props.form
    inputs = props.inputs
    return <GeoIdSection inputs={props.inputs} recipeId={OWNER}/>
})

const show = ({geoId, bufferMeters = ''}) => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            loadedRecipes: {
                [OWNER]: {
                    id: OWNER,
                    type: 'MOSAIC',
                    model: {},
                    layers: {},
                    ui: {featureLayerSources: [{id: 'aoi-source', type: 'Aoi'}]}
                }
            },
            recipes: [],
            projects: [],
            tabs: []
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(
        <Provider store={store}>
            <Recipe id={OWNER}>
                <Host values={{section: 'GEOID', geoId, bufferMeters}}/>
            </Recipe>
        </Provider>
    ))
}
