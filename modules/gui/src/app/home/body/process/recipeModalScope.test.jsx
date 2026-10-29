import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {LabelsLayerOptionsPanel} from '~/app/home/map/labelsLayerOptionsPanel'
import {compose} from '~/compose'
import {Enabled} from '~/enabled'
import {initStore, select} from '~/store'
import {collectActivatables} from '~/widget/activation/activation'
import {ActivationContext} from '~/widget/activation/activationContext'
import {activateIn} from '~/widget/activation/activator'
import {AssetDestinationBrowser} from '~/widget/assetDestinationBrowser'
import {Confirm} from '~/widget/confirm'
import {EventShield} from '~/widget/eventShield'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Panel} from '~/widget/panel/panel'
import {PortalContainer} from '~/widget/portal'
import {selectTab} from '~/widget/tabs/tabActions'
import {Tabs} from '~/widget/tabs/tabs'

import {recipeActionBuilder} from './recipe'
import {modalSubformPanel as historicalSubform} from './recipe/baytsHistorical/panels/options/modalSubformPanel'
import {CeoLogin} from './recipe/classification/panels/trainingData/ceo/ceoLogin'
import {modalSubformPanel as radarSubform} from './recipe/mosaic/panels/radarMosaicOptions/modalSubformPanel'
import {Recipe, recipeActivationPath} from './recipeContext'
import {RecipeHome} from './recipeHome'

// Exercise the real recipe boundary, tab owner, activation and forms. Ordinary and previously unknown callers
// have no scope prop/provider. The landing list is replaced by its real Project dialog, to isolate ownership
// from listing and CRUD work; APIs and scrolling do not participate in that decision.
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('~/apiRegistry', () => ({default: {recipe: {load$: () => NEVER, loadAll$: () => NEVER, save$: () => NEVER}}}))
vi.mock('~/ceo', () => ({ceoLogin$: () => NEVER}))
vi.mock('./recipeList/recipeList', async () => {
    const {Project} = await import('./recipeList/project')
    return {RecipeList: () => <Project project={{name: 'Shared project'}} projectNames={[]} onApply={() => {}} onCancel={() => {}}/>}
})
vi.mock('~/widget/scrollable', async () => {
    const {NEVER} = await import('rxjs')
    const scrollable = {clientHeight: 0, mouseAway$: NEVER, centerElement: () => {}, scrollElement: () => {}}
    return {
        Scrollable: ({children}) => <div>{typeof children === 'function' ? children(scrollable) : children}</div>,
        withScrollable: () => Component => function WithScrollableStub(props) {
            return <Component {...props} scrollable={scrollable}/>
        }
    }
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('modal ownership supplied by the recipe context', () => {
    it('scopes an ordinary panel and nested confirmation without caller opt-ins', async () => {
        await mount({A: 'plain', B: 'plain'})
        expect(layer(A).contains(draft(A))).toBe(true)
        expect(globalLayer().contains(draft(A))).toBe(false)

        await configure(A, 'confirm')
        expect(layer(A).querySelectorAll('[class*="_modalWrapper_"]')).toHaveLength(2)
        expect(wrapper(draft(A)).hasAttribute('inert')).toBe(true)
        expect(globalLayer().textContent).not.toContain('Nested confirmation')
    })

    it('keeps independent Form.Panel drafts across tabs and section navigation, and applies only their owner', async () => {
        await mount({A: 'form', B: 'form'})
        await type(draft(A), 'A draft')
        await show(B)
        await type(draft(B), 'B draft')
        await act(async () => setSectionEnabled(false))
        await act(async () => setSectionEnabled(true))
        expect(draft(B).value).toBe('B draft')
        await click(layer(B), 'button.apply')

        expect(select(['process.loadedRecipes', B, 'model.name'])).toBe('B draft')
        expect(select(['process.loadedRecipes', A, 'model.name'])).toBe('A saved')
        await show(A)
        expect(draft(A).value).toBe('A draft')
        await click(layer(A), 'button.cancel')
        expect(select(['process.loadedRecipes', A, 'model.name'])).toBe('A saved')
    })

    it('inherits scope for the real date picker, retaining the parent draft through navigation and Cancel', async () => {
        await mount({A: 'form', B: 'plain'})
        await type(draft(A), 'Unapplied parent')
        const datePicker = Object.keys(collectActivatables(select(), activationPath(A))).find(id => id.startsWith('datePicker-'))
        await activate(A, datePicker)

        expect(layer(A).querySelectorAll('[class*="_modalWrapper_"]')).toHaveLength(2)
        expect(wrapper(draft(A)).hasAttribute('inert')).toBe(true)
        await show(B)
        await show(A)
        await click(layer(A).lastElementChild, 'button.close')
        expect(draft(A).value).toBe('Unapplied parent')
        expect(wrapper(draft(A)).hasAttribute('inert')).toBe(false)
    })

    it.each(['radar', 'historical'])('scopes the real %s subform without changing its draft/Apply boundary', async kind => {
        await mount({A: kind, B: 'plain'})
        await activate(A, 'processing-details')
        const nested = layer(A).lastElementChild.querySelector('input')
        await type(nested, '7')
        await show(B)
        await show(A)
        expect(nested.value).toBe('7')
        await click(layer(A).lastElementChild, 'button.apply')
        expect(select(['process.loadedRecipes', A, 'model.value'])).toBe(3)
        expect(layer(A).querySelector('input[data-value]').value).toBe('7')
        await click(layer(A), 'button.cancel')
        expect(select(['process.loadedRecipes', A, 'model.value'])).toBe(3)
    })

    it('scopes the actual Labels panel, retaining a category edit and applying it only to its recipe', async () => {
        await mount({A: 'labels', B: 'plain'})
        await activate(A, 'labelsLayerOptions-main')
        expect(layer(A).textContent).toContain('featureLayerSources.Labels.type')
        await click(layer(A), 'map.labelsLayerStyle.categories.road')
        await show(B)
        await show(A)
        await click(layer(A), 'button.apply')

        expect(select(['process.loadedRecipes', A, 'layers.areas.main.featureLayers', {sourceId: 'labels'}, 'layerConfig.style.categories.road'])).toBe(false)
        expect(select(['process.loadedRecipes', B, 'layers.areas.main.featureLayers', {sourceId: 'labels'}, 'layerConfig.style'])).toBeUndefined()
    })

    it('keeps project management in the real landing component application-wide', async () => {
        await mount({A: 'home', B: 'plain'})
        expect(globalLayer().textContent).toContain('process.project.title')
        expect(layer(A).querySelectorAll('[class*="_modalWrapper_"]')).toHaveLength(0)
    })

    it('scopes the real export asset destination browser without a caller override', async () => {
        await mount({A: 'asset', B: 'plain'})
        await activate(A, 'assetBrowser', {assetId: 'users/example/output'})
        expect(layer(A).textContent).toContain('asset.browser.title')
        expect(globalLayer().textContent).not.toContain('asset.browser.title')
        await show(B)
        await show(A)
        expect(layer(A).querySelector('input').value).toBe('users/example/output')
    })

    it('keeps the CEO account login application-wide inside a recipe', async () => {
        await mount({A: 'ceo', B: 'plain'})
        await activate(A, 'ceoLogin')
        expect(globalLayer().textContent).toContain('process.classification.panel.trainingData.form.ceo.login.title')
        expect(layer(A).querySelectorAll('[class*="_modalWrapper_"]')).toHaveLength(0)
    })

    it('keeps a modal outside recipe context application-wide', async () => {
        await mount({A: 'outside', B: 'plain'})
        expect(globalLayer().contains(draft(A))).toBe(true)
        expect(layer(A).contains(draft(A))).toBe(false)
    })
})

const A = 'recipe-a'
const B = 'recipe-b'
let root, container, setKinds, setSectionEnabled

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

async function mount(kinds) {
    const record = (id, name) => ({
        id, type: 'MOSAIC', model: {name, value: 3}, ui: {initialized: true},
        layers: {areas: {main: {featureLayers: [{sourceId: 'labels', layerConfig: {}}]}}}
    })
    const store = createStore((state = {
        dimensions: {width: 1280, height: 800},
        process: {
            tabs: [{id: A, title: 'Recipe A'}, {id: B, title: 'Recipe B'}], selectedTabId: A,
            loadedRecipes: {[A]: record(A, 'A saved'), [B]: record(B, 'B saved')}, recipes: [], projects: []
        }
    }, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<Provider store={store}><Harness kinds={kinds}/></Provider>))
}

const Harness = ({kinds: initial}) => {
    const [kinds, update] = React.useState({[A]: initial.A, [B]: initial.B})
    const [enabled, setEnabled] = React.useState(true)
    setKinds = update
    setSectionEnabled = setEnabled
    return <EventShield>
        <ActivationContext id='root'>
            <Enabled enabled={enabled}>
                <Tabs label='Process' statePath='process'>
                    {({id}) => kinds[id] === 'outside'
                        ? <PlainPanel id={id}/>
                        : <Recipe id={id}><Contents id={id} kind={kinds[id]}/></Recipe>}
                </Tabs>
            </Enabled>
            <PortalContainer/>
        </ActivationContext>
    </EventShield>
}

const close = id => setKinds(kinds => ({...kinds, [id]: 'closed'}))
const configure = (id, kind) => act(async () => setKinds(kinds => ({...kinds, [id]: kind})))
const show = id => act(async () => selectTab(id, 'process'))
const layer = id => document.getElementById(`dialogs_tab_${id}`)
const globalLayer = () => document.getElementById('defaultPortalContainer')
const draft = id => document.querySelector(`[data-draft="${id}"]`) || layer(id).querySelector('input[name="name"]')
const wrapper = element => element.closest('[class*="_modalWrapper_"]')
const activationPath = id => recipeActivationPath(['activation', 'contexts', 'root'], id)
const activate = (id, panel, props = {}) => act(async () => { expect(activateIn(activationPath(id), panel, props)).toBe(true) })

const Contents = ({id, kind}) => {
    switch (kind) {
        case 'closed': return null
        case 'home': return <RecipeHome recipeId={id}/>
        case 'ceo': return <CeoLogin/>
        case 'labels': return <LabelsLayerOptionsPanel area='main'/>
        case 'asset': return <AssetDestinationBrowser onChange={() => {}}/>
        case 'form':
        case 'radar':
        case 'historical':
            return <DraftPanel id={id} kind={kind} values={{name: select(['process.loadedRecipes', id, 'model.name']), date: '2020-01-01', value: 3}}/>
        default: return <PlainPanel id={id} confirm={kind === 'confirm'}/>
    }
}

const PlainPanel = ({id, confirm}) => <Panel>
    <input data-draft={id}/>
    {confirm ? <Confirm title='Nested confirmation' message='Confirm the draft' onConfirm={() => {}} onCancel={() => {}}/> : null}
</Panel>

const detailFields = {value: new Form.Field().number()}
const detail = factory => factory({id: 'processing-details', toTitle: () => 'Processing details', toClassName: () => 'details', fields: detailFields})(
    ({inputs}) => <Form.Input label='Detail value' input={inputs.value}/>
)
const RadarDetails = detail(radarSubform)
const HistoricalDetails = detail(historicalSubform)

const DraftPanel = compose(
    ({id, kind, form, inputs}) => <Form.Panel
        form={form}
        placement='modal'
        onApply={values => recipeActionBuilder(id)('APPLY_DRAFT').assign('model', values).dispatch()}
        onClose={() => close(id)}>
        <Panel.Content>
            <Form.Input label='Name' input={inputs.name}/>
            <input data-value readOnly value={inputs.value.value}/>
            <Form.DatePicker label='Date' input={inputs.date} startDate='2019-01-01' endDate='2030-01-01'/>
            {kind === 'radar' ? <RadarDetails inputsToUpdate={{value: inputs.value}}/> : null}
            {kind === 'historical' ? <HistoricalDetails inputsToUpdate={{value: inputs.value}}/> : null}
        </Panel.Content>
        <Form.PanelButtons/>
    </Form.Panel>,
    withForm({fields: {name: new Form.Field().notBlank(), date: new Form.Field(), ...detailFields}})
)

async function type(input, value) {
    expect(input).not.toBeNull()
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
}

async function click(inElement, label) {
    const button = [...inElement.querySelectorAll('button')].find(element => element.textContent === label)
    expect(button).toBeDefined()
    await act(async () => button.click())
}
