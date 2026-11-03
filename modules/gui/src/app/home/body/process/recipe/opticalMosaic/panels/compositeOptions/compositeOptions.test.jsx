import _ from 'lodash'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

const harness = vi.hoisted(() => ({deactivate: vi.fn()}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/apiRegistry', () => ({default: {}}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: () => ({sourceRequirements: []})}))
vi.mock('~/app/home/body/process/sourceRuntime/sourceRuntimeContext', () => ({
    withSourceRuntime: () => Component => props => <Component {...props} sourceRuntime={null}/>
}))
vi.mock('~/widget/panelWizard', () => ({
    withPanelWizard: () => Component => props => <Component {...props} panelWizard={{wizard: null}}/>
}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => <Component {...props} activatable={{active: true, deactivate: harness.deactivate}}/>
}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))

const {defaultModel} = await import('../../opticalMosaicRecipe')
const {createCompositeOptions} = await import('./compositeOptions')
const CompositeOptions = createCompositeOptions({id: 'compositeOptions'})

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
    root = container = store = null
})

const models = [
    ['new mosaic', () => _.cloneDeep(defaultModel)],
    ['older Sentinel-2 mosaic with missing defaults', () => {
        const model = _.cloneDeep(defaultModel)
        model.sources.dataSets = {SENTINEL_2: ['SENTINEL_2']}
        for (const name of ['cloudBuffer', 'cloudBuffering', 'orbitOverlap', 'tileOverlap']) {
            delete model.compositeOptions[name]
        }
        model.compositeOptions.cloudBuffering = 0
        return model
    }],
    ['explicit settings', () => ({..._.cloneDeep(defaultModel), compositeOptions: {
        ..._.cloneDeep(defaultModel.compositeOptions), cloudBuffer: 600, orbitOverlap: 'REMOVE', tileOverlap: 'REMOVE'
    }})]
]

it.each(models)('keeps %s clean through opening, More/Less, Close and reopening', async (_name, modelOf) => {
    const model = modelOf()
    await open(model)

    expect(button('button.apply')).toBeUndefined()
    expect(recipe().ui.compositeOptions.dirty).toBe(false)
    await click('button.more')
    expect(button('button.apply')).toBeUndefined()
    await click('button.less')
    expect(button('button.apply')).toBeUndefined()
    await click('button.close')
    expect(harness.deactivate).toHaveBeenCalled()
    expect(recipe().model).toEqual(model)
    await act(async () => root.render(view(false)))
    await act(async () => root.render(view(true)))
    expect(button('button.apply')).toBeUndefined()
    expect(recipe().ui.compositeOptions.dirty).toBe(false)
    expect(recipe().model).toEqual(model)
})

it.each(models)('cancels real edits to %s without persisting defaults or changing saved settings', async (_name, modelOf) => {
    const model = modelOf()
    await open(model)
    await click('process.mosaic.panel.composite.form.composingMethod.median.label')

    expect(button('button.apply')).toBeDefined()
    await click('button.cancel')

    expect(recipe().model).toEqual(model)
    await act(async () => root.render(view(false)))
    await act(async () => root.render(view(true)))
    expect(button('button.apply')).toBeUndefined()
    expect(recipe().ui.compositeOptions.dirty).toBe(false)
})

it.each(models)('applies a real edit to %s and retains its effective buffer/overlap choices', async (_name, modelOf) => {
    const model = modelOf()
    await open(model)
    await click('process.mosaic.panel.composite.form.composingMethod.median.label')
    await click('button.apply')

    expect(recipe().model.compositeOptions).toMatchObject({
        compose: 'MEDIAN', cloudBuffer: model.compositeOptions.cloudBuffer ?? 0,
        orbitOverlap: model.compositeOptions.orbitOverlap || 'KEEP', tileOverlap: model.compositeOptions.tileOverlap || 'KEEP'
    })
})

it('seeds new mosaics with the cloudBuffer field the panel and execution read', () => {
    expect(defaultModel.compositeOptions.cloudBuffer).toBe(0)
    expect(defaultModel.compositeOptions).not.toHaveProperty('cloudBuffering')
})

const recipe = () => store.getState().process.loadedRecipes.mosaic
const button = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)
const click = async label => {
    expect(button(label), `Missing button ${label}`).toBeDefined()
    await act(async () => button(label).click())
}
const open = async model => {
    harness.deactivate.mockClear()
    const initial = {
        process: {loadedRecipes: {mosaic: {id: 'mosaic', type: 'MOSAIC', model: _.cloneDeep(model), ui: {}}}, recipes: [], tabs: [{id: 'mosaic'}], saveStates: {}},
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initial, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(view(true)))
}
const view = shown => <Provider store={store}>
    <Recipe id='mosaic'>
        <EventShield>
            <PortalContainer/>
            <PortalContainer id='panels'/>
            <PortalContext id='panels'>{shown && <CompositeOptions title='Composite options'/>}</PortalContext>
        </EventShield>
    </Recipe>
</Provider>
