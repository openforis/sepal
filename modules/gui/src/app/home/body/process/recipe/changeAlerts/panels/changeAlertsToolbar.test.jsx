import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'

// What the toolbar offers over a source it has a description of, and over one it does not. A read that
// failed leaves nothing to chart or export, however much configuration the recipe carries.

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('./chartPixel', () => ({ChartPixel: () => <output aria-label='chart'/>}))
vi.mock('./retrieve/retrieve', () => ({Retrieve: () => null}))
vi.mock('./reference/reference', () => ({Reference: () => null}))
vi.mock('./date/date', () => ({Date: () => null}))
vi.mock('./sources/sources', () => ({Sources: () => null}))
vi.mock('./options/options', () => ({Options: () => null}))
vi.mock('~/app/home/body/process/recipe', async importOriginal => ({
    ...await importOriginal(),
    setInitialized: () => {}
}))
vi.mock('~/app/home/body/process/recipe/mosaic/panels/radarMosaicOptions/options', () => ({Options: () => null}))
vi.mock('~/app/home/body/process/recipe/opticalMosaic/panels/compositeOptions/compositeOptions', () => ({
    createCompositeOptions: () => () => null
}))
vi.mock('~/app/home/body/process/recipe/planetMosaic/panels/options/options', () => ({Options: () => null}))
vi.mock('~/widget/panelWizard', () => ({PanelWizard: ({children}) => <div>{children}</div>}))
vi.mock('~/widget/toolbar/toolbar', () => ({
    Toolbar: Object.assign(({children}) => <div>{children}</div>, {ActivationButton: () => null})
}))
vi.mock('~/app/home/body/process/recipe/chartPixelButton', () => ({
    ChartPixelButton: ({disabled}) => <button aria-label='chart-pixel' disabled={disabled}/>
}))
vi.mock('../../retrieveButton', () => ({
    RetrieveButton: ({disabled}) => <button aria-label='retrieve' disabled={disabled}/>
}))

const {ChangeAlertsToolbar} = await import('./changeAlertsToolbar')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ALERTS = 'alerts-1'
const SOURCE_KEY = 'RECIPE_REF:masking-1'

let root, container

afterEach(() => {
    act(() => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

describe('an initialized recipe', () => {
    it('offers the chart and Retrieve while its source is described', () => {
        render(alerts({
            sourceKey: SOURCE_KEY,
            status: 'OBSERVED',
            segments: {bands: ['ndvi_rmse'], baseBands: [{name: 'ndvi', measures: ['value']}]}
        }))

        expect(button('chart-pixel').disabled).toBe(false)
        expect(button('retrieve').disabled).toBe(false)
        expect(container.querySelector('output')).not.toBeNull()
    })

    it('offers neither once a read of that source has failed', () => {
        render(alerts({sourceKey: SOURCE_KEY, status: 'UNAVAILABLE'}))

        expect(button('chart-pixel').disabled).toBe(true)
        expect(button('retrieve').disabled).toBe(true)
        expect(container.querySelector('output')).toBeNull()
    })
})

const button = label => container.querySelector(`button[aria-label='${label}']`)

const alerts = sourceEvidence => ({
    id: ALERTS,
    type: 'CHANGE_ALERTS',
    model: {
        reference: {type: 'RECIPE_REF', id: 'masking-1'},
        sources: {band: 'ndvi', dataSets: {LANDSAT: ['LANDSAT_8']}},
        options: {}
    },
    ui: {initialized: true, sourceEvidence}
})

const render = recipe => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {loadedRecipes: {[recipe.id]: recipe}, tabs: [{id: recipe.id}], recipes: []}
    }
    const store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(
        <Provider store={store}>
            <Recipe id={recipe.id}>
                <ChangeAlertsToolbar/>
            </Recipe>
        </Provider>
    ))
}
