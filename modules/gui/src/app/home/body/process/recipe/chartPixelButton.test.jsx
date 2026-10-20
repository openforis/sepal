import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {MapContext} from '~/app/home/map/mapContext'
import {initStore} from '~/store'

// The chart action of a recipe whose chart reads observations (`observes`): offered only while what the recipe's type
// declares they require is met, and a pixel being chosen when that stops is no longer chosen. A recipe charting
// segments alone is offered as its segment requirements say, whatever its observations would require. The
// registrations, readiness and store are real; the map and the toolbar's widgets are replaced.

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/apiRegistry', () => ({default: {}}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
vi.mock('~/widget/icon', () => ({Icon: () => null}))
vi.mock('~/widget/toolbar/toolbar', () => ({
    Toolbar: {Button: ({onClick, disabled}) => <button aria-label='chart' disabled={disabled} onClick={onClick}/>}
}))

const {addRecipeType} = await import('../recipeTypeRegistry')
const {default: ccdc} = await import('./ccdc/ccdc')
const {default: timeSeries} = await import('./timeSeries/timeSeries')
const {ChartPixelButton} = await import('./chartPixelButton')

addRecipeType(ccdc())
addRecipeType(timeSeries())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container

afterEach(() => {
    act(() => root?.unmount())
    root = null
    container?.remove()
})

describe.each(['TIME_SERIES', 'CCDC'])('the chart action of a %s', type => {
    it('is not offered where the classification does not suit the images, and is again once it does', () => {
        render(type, classificationOver(RADAR_STATISTICS), {observes: true})
        expect(chartButton().disabled).toBe(true)

        holdClassification(classificationOver(COMPATIBLE))

        expect(chartButton().disabled).toBe(false)
    })

    it('waits, not offered, while the classification is still to be read', () => {
        render(type, null, {observes: true})

        expect(chartButton().disabled).toBe(true)
    })

    it('stops choosing a pixel once the classification is found not to suit the images', () => {
        const {map} = render(type, classificationOver(COMPATIBLE), {observes: true})
        act(() => chartButton().click())
        expect(map.listening).toBe(true)

        holdClassification(classificationOver(RADAR_STATISTICS))

        expect(map.listening).toBe(false)
        expect(map.interacting).toBe(false)
        expect(chartButton().disabled).toBe(true)
    })

    it('is offered by its segment requirements alone where its chart does not read observations', () => {
        render(type, classificationOver(RADAR_STATISTICS), {observes: false})

        expect(chartButton().disabled).toBe(false)
    })
})

const ID = 'recipe-1'
const CLASSIFICATION = 'classification-1'
const COMPATIBLE = ['red', 'nir', 'ndvi']
const RADAR_STATISTICS = ['VV_mean', 'VH_med']

const recipeOf = type => ({
    id: ID,
    type,
    title: 'Recipe',
    model: {
        aoi: {type: 'RECIPE', id: 'aoi-recipe'},
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi'], classification: CLASSIFICATION},
        options: {corrections: ['SR']}
    },
    ui: {}
})

const classificationOver = included => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]}}
})

const chartButton = () => container.querySelector('button[aria-label=chart]')

const holdClassification = classification => act(() => actionBuilder('HOLD_CLASSIFICATION')
    .set(['process.loadedRecipes', CLASSIFICATION], classification)
    .dispatch())

// A map that says whether a click is being listened for, and whether it is in the chart's interaction mode.
const mapOf = () => {
    const map = {listening: false, interacting: false, getZoom: () => 1, setView: () => {}}
    map.addOneShotClickListener = () => {
        map.listening = true
        return {remove: () => map.listening = false}
    }
    map.enterInteractionMode = () => {
        map.interacting = true
        return {remove: () => map.interacting = false}
    }
    return map
}

const render = (type, classification, {observes}) => {
    const recipe = recipeOf(type)
    const map = mapOf()
    const initialState = {
        process: {
            loadedRecipes: Object.fromEntries([recipe, classification].filter(Boolean).map(record => [record.id, record])),
            tabs: [{id: recipe.id}],
            recipes: []
        }
    }
    const store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(
        <Provider store={store}>
            <MapContext map={map}>
                <Recipe id={recipe.id}>
                    <ChartPixelButton observes={observes} onPixelSelected={() => {}}/>
                </Recipe>
            </MapContext>
        </Provider>
    ))
    return {map}
}
