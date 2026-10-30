import {act, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER, of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {addRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {compose} from '~/compose'
import {initStore, select} from '~/store'
import {setLanguage, TranslationProvider} from '~/translate'
import {ActivationContext} from '~/widget/activation/activationContext'
import {Confirm} from '~/widget/confirm'
import {EventShield} from '~/widget/eventShield'
import {Form} from '~/widget/form'
import {FormContext} from '~/widget/form/context'
import {withForm} from '~/widget/form/form'
import {withInputFeedback} from '~/widget/form/inputFeedback'
import {Label} from '~/widget/label'
import {Panel} from '~/widget/panel/panel'
import {PortalContainer} from '~/widget/portal'
import {selectTab} from '~/widget/tabs/tabActions'
import {Tabs} from '~/widget/tabs/tabs'

import {classificationTrainingDataRequirements} from './classification/trainingDataRequirements'
import {describeFeedback, feedbackMessage, feedbackText, joinFeedback, recipeReference} from './feedbackMessage'
import {feedbackContent, joinFeedbackContent} from './feedbackMessageContent'
import {referenceFeedback} from './referenceFeedback'
import {withItemProblems, withSourceProblems} from './selectedSource'
import {itemStatusesOf, sectionStatusOf} from './selectedSourceStatus'
import {sourceInputFeedback} from './sourceInputFeedback'
import {UNSUPPORTED} from './sourceRequirements'

const fake = vi.hoisted(() => ({load: vi.fn(), error: vi.fn(), applied: vi.fn(), cancelled: vi.fn()}))
vi.mock('~/apiRegistry', () => ({default: {recipe: {load$: (...args) => fake.load(...args), save$: () => NEVER}}}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: (...args) => fake.error(...args), info: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/scrollable', async () => {
    const {NEVER} = await import('rxjs')
    const scrollable = {clientHeight: 0, mouseAway$: NEVER, centerElement: () => {}, scrollElement: () => {}}
    return {
        Scrollable: ({children}) => <div>{typeof children === 'function' ? children(scrollable) : children}</div>,
        withScrollable: () => Component => props => <Component {...props} scrollable={scrollable}/>
    }
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, container
const SECTION = {id: 'sources', label: 'process.ccdc.panel.sources.button'}
const reference = {id: 'b', name: 'Provider'}
const record = (id, title) => ({id, title, type: 'MOSAIC', revision: 3, ui: {initialized: true}, model: {name: 'Saved name'}})

addRecipeType({id: 'FEEDBACK_TEST', imageSource: true, sourceRequirements: [{
    id: 'feedback-test', section: SECTION, localFacts: () => ({}),
    items: () => [{id: 'selected', label: 'Source', facts: {}}],
    requirement: {
        evaluate: () => ({status: UNSUPPORTED, diagnostic: {}}),
        describe: () => ({...describeFeedback(feedbackMessage('process.source.status.recipeNeedsAttention', {
            recipe: recipeReference('b', 'Provider')
        })), details: []})
    }, operations: []
}]})

beforeEach(async () => {
    setLanguage('en')
    const translations = createRoot(document.createElement('div'))
    await act(async () => translations.render(<TranslationProvider/>))
    await act(async () => translations.unmount())
    fake.load.mockReset().mockImplementation(id => of(record(id, 'Closed provider')))
    fake.error.mockReset()
    fake.applied.mockReset()
    fake.cancelled.mockReset()
})
afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    setLanguage('en')
})

describe('recipe links in shared validation presentation', () => {
    it('keeps plain messages unchanged', async () => {
        await mount({message: 'Choose a source', details: [], advisories: [], state: 'UNMET_CONFIGURATION'})
        expect(joinFeedback(['One', 'Two'])).toBe('One Two')
        expect(joinFeedbackContent(['One', 'Two'])).toBe('One Two')
        expect(feedbackContent({message: 'Choose a source'})).toBe('Choose a source')
        await openFeedback()
        expect(tooltip().textContent).toBe('Choose a source')
        expect(links()).toHaveLength(0)
    })

    it('opens a direct reference from an error tooltip, preserving the modal draft', async () => {
        await mount(statusFor({reference, origins: [reference]}))
        await changeName('Unapplied name')
        await openFeedback()
        expect(tooltip().textContent).toBe('Provider needs attention.')
        expect(links().map(button => button.textContent)).toEqual(['Provider'])
        await clickLink(0)
        expect(select('process.selectedTabId')).toBe('b')
        expect(fake.load).not.toHaveBeenCalled()
        expect(fake.cancelled).not.toHaveBeenCalled()
        await show('a')
        expect(nameInput().value).toBe('Unapplied name')
        expect(select(['process.loadedRecipes', 'a', 'model.name'])).toBe('Saved name')
    })

    it('keeps nested recipes with identical names distinct and linked by ID', async () => {
        const origins = [{id: 'b', name: 'Same name'}, {id: 'c', name: 'Same name'}]
        const status = statusFor({reference: {id: 'd', name: 'Reference'}, origins})
        await mount(status)
        await openFeedback()
        expect(tooltip().textContent).toBe('Reference cannot run because Same name, Same name need attention.')
        expect(links().map(button => button.textContent)).toEqual(['Reference', 'Same name', 'Same name'])
        await clickLink(1)
        expect(select('process.selectedTabId')).toBe('b')
        await show('a')
        await openFeedback()
        await clickLink(2)
        expect(select('process.selectedTabId')).toBe('c')
        expect(fake.load).not.toHaveBeenCalled()
    })

    it('opens an authoritative closed recipe without changing the current panel', async () => {
        const provider = {id: 'd', name: 'Closed provider'}
        await mount(statusFor({reference: provider, origins: [provider]}))
        await changeName('Keep this draft')
        await openFeedback()
        await clickLink(0)
        expect(fake.load).toHaveBeenCalledExactlyOnceWith('d')
        expect(select('process.tabs').map(({id}) => id)).toEqual(['a', 'b', 'c', 'd'])
        expect(select(['process.saveStates', 'd', 'revision'])).toBe(3)
        await show('a')
        expect(nameInput().value).toBe('Keep this draft')
    })

    it('disables a link during its load and opens the target once', async () => {
        const provider = {id: 'd', name: 'Closed provider'}
        const held = new Subject()
        fake.load.mockReturnValue(held)
        await mount(statusFor({reference: provider, origins: [provider]}))
        await openFeedback()
        await clickLink(0)
        expect(links()[0].disabled).toBe(true)
        await act(async () => links()[0].click())
        expect(fake.load).toHaveBeenCalledTimes(1)
        await act(async () => { held.next(record('d', 'Closed provider')); held.complete() })
        expect(select('process.selectedTabId')).toBe('d')
    })

    it('reports an unavailable recipe without closing or changing the source panel', async () => {
        const provider = {id: 'missing', name: 'Unavailable provider'}
        const error = new Error('Not available')
        fake.load.mockReturnValue(throwError(() => error))
        await mount(statusFor({reference: provider, origins: [provider]}))
        await openFeedback()
        await clickLink(0)
        expect(fake.error).toHaveBeenCalledWith({message: 'Unable to load recipe', error})
        expect(select('process.selectedTabId')).toBe('a')
        expect(fake.cancelled).not.toHaveBeenCalled()
        expect(fake.applied).not.toHaveBeenCalled()
        expect(links()[0].disabled).toBe(false)
    })

    it('keeps training-feature and repair references through editor composition', async () => {
        const declaration = classificationTrainingDataRequirements.find(({id}) => id === 'MISSING_TRAINING_FEATURES')
        const diagnosis = declaration.requirement.describe({
            diagnostics: [{provider: 'b', features: ['nir']}], item: {recipeNames: {b: 'Provider'}}
        })
        const message = declaration.editor.message(diagnosis)
        const messageContent = declaration.editor.messageContent(diagnosis)
        await mount({message, messageContent, details: [], advisories: [], state: 'UNMET_CONFIGURATION'})
        await openFeedback()
        expect(tooltip().textContent).toBe(message)
        expect(links().map(button => button.textContent)).toEqual(['Provider', 'Provider'])
        await clickLink(1)
        expect(select('process.selectedTabId')).toBe('b')
    })

    it('keeps recipe references through section summaries and item feedback', async () => {
        const read = readFor({reference, origins: [reference]})
        const section = sectionStatusOf({}, [read], SECTION.id)
        const item = itemStatusesOf([read], SECTION.id).selected
        expect(section.message).toBe(item.message)
        expect(feedbackText(section.messageContent)).toBe(section.message)
        expect(feedbackText(item.messageContent)).toBe(item.message)
        await mount(section)
        await openFeedback()
        expect(links().map(button => button.textContent)).toEqual(['Provider'])
    })

    it('renders links through the common section and item presenters', async () => {
        await mount(statusFor({reference, origins: [reference]}), true)
        for (const kind of ['section', 'item']) {
            await act(async () => document.querySelector(`[data-presentation="${kind}"] [data-feedback="error"]`).closest('button').click())
            await pause(30)
            expect(links().map(button => button.textContent)).toEqual(['Provider'])
            await clickLink(0)
            expect(select('process.selectedTabId')).toBe('b')
            await show('a')
        }
    })

    it('keeps the two recipe references in held-map feedback, including its quotes', async () => {
        await mount({...describeFeedback(feedbackMessage('map.layerSource.heldUpstream', {
            recipe: recipeReference('c', 'Consumer'), source: recipeReference('b', 'Cause')
        })), details: [], advisories: [], state: 'UNMET_CONFIGURATION'})
        await openFeedback()
        expect(tooltip().textContent).toBe('Cannot render \'Consumer\'. Review \'Cause\', which it reads.')
        expect(links().map(button => button.textContent)).toEqual(['Consumer', 'Cause'])
        await clickLink(1)
        expect(select('process.selectedTabId')).toBe('b')
    })

    it('withdraws a parent tooltip while a nested panel covers its owner', async () => {
        await mount(statusFor({reference, origins: [reference]}))
        await changeName('Unapplied name')
        await openFeedback()
        await act(async () => fake.cover(true))
        expect(tooltip()).toBeNull()
        await act(async () => fake.cover(false))
        expect(nameInput().value).toBe('Unapplied name')
        await openFeedback()
        expect(links().map(button => button.textContent)).toEqual(['Provider'])
    })

    it('uses the English rich-message fallback and preserves plural arguments', async () => {
        setLanguage('fr')
        const messageContent = feedbackMessage('process.classification.panel.trainingData.reusedRecipe.repair', {
            recipes: joinFeedback([recipeReference('b', 'Provider'), recipeReference('c', 'Other')], ', '), count: 2
        })
        await mount({...describeFeedback(messageContent), details: [], advisories: [], state: 'UNMET_CONFIGURATION'})
        await openFeedback()
        expect(tooltip().textContent).toBe('Fix the problems in Provider, Other, or select another recipe.')
        expect(links().map(button => button.textContent)).toEqual(['Provider', 'Other'])
    })

    it('does not turn recipe-looking plain text or an unknown identity into a link', async () => {
        const messageContent = feedbackMessage('process.source.status.recipeNeedsAttention', {recipe: recipeReference(null, 'Provider')})
        await mount({...describeFeedback(messageContent), details: [], advisories: [], state: 'UNMET_CONFIGURATION'})
        await openFeedback()
        expect(tooltip().textContent).toBe('Provider needs attention.')
        expect(links()).toHaveLength(0)
    })
})

const readFor = referenceFeedbackValue => {
    const declaration = referenceFeedback({section: SECTION, roles: [], itemOf: () => null})
    const diagnostic = {item: {referenceFeedback: referenceFeedbackValue}}
    return {local: true, item: {id: 'selected'}, declaration, unmetPrerequisites: [],
        verdict: {status: UNSUPPORTED}, ownVerdict: {status: UNSUPPORTED, diagnostic}}
}
const statusFor = feedback => itemStatusesOf([readFor(feedback)], SECTION.id).selected

const Host = compose(
    ({form, inputs, status, presenters}) => {
        const [covered, setCovered] = useState(false)
        fake.cover = setCovered
        const feedback = sourceInputFeedback(status, () => {})
        const presented = withInputFeedback(form, {feedbackOf: name => name === 'source' ? feedback : null, blocked: () => false})
        return <FormContext form={presented}>
            <Form.Panel form={presented} placement='modal' onApply={fake.applied} onCancel={fake.cancelled}>
                <Panel.Header title='Original panel'/>
                <Panel.Content>
                    <Form.Input label='Name' input={inputs.name}/>
                    <Form.Input label='Source' input={inputs.source}/>
                    {presenters ? <><SectionProblem recipeId='a'/><ItemProblem recipeId='a'/></> : null}
                    {covered ? <Confirm message='A nested panel' onConfirm={() => setCovered(false)} onCancel={() => setCovered(false)}/> : null}
                </Panel.Content>
                <Form.PanelButtons/>
            </Form.Panel>
        </FormContext>
    },
    withForm({fields: {name: new Form.Field(), source: new Form.Field()}})
)

const SectionProblem = compose(
    ({sourceProblems}) => <div data-presentation='section'><Label msg='Section' error={sourceProblems.sources}/></div>,
    withSourceProblems()
)
const ItemProblem = compose(
    ({itemProblems}) => <div data-presentation='item'><Label msg='Item' error={itemProblems.selected}/></div>,
    withItemProblems(SECTION.id)
)

async function mount(status, presenters = false) {
    const records = Object.fromEntries(['a', 'b', 'c'].map(id => [id, record(id, id)]))
    if (presenters) records.a.type = 'FEEDBACK_TEST'
    const store = createStore((state = {dimensions: {width: 1280, height: 800}, process: {
        loadedRecipes: records, tabs: Object.values(records).map(({id, title}) => ({id, title})), selectedTabId: 'a',
        recipes: Object.values(records).map(({id, title}) => ({id, name: title})), projects: []
    }}, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<Provider store={store}><TranslationProvider>
        <EventShield><ActivationContext id='root'><Tabs label='Process' statePath='process'>
            {({id}) => <Recipe id={id}>{id === 'a'
                ? <Host status={status} presenters={presenters} values={{name: 'Saved name', source: 'b'}}/>
                : <div>{id}</div>}</Recipe>}
        </Tabs><PortalContainer/></ActivationContext></EventShield>
    </TranslationProvider></Provider>))
    await pause(120)
}
const pause = ms => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)) })
const tooltip = () => document.querySelector('.rc-tooltip-inner')
const links = () => [...(tooltip()?.querySelectorAll('button') || [])]
const nameInput = () => document.querySelector('#dialogs_tab_a input[name="name"]')
const show = id => act(async () => selectTab(id, 'process'))
const openFeedback = async () => {
    await act(async () => document.querySelector('#dialogs_tab_a [data-feedback="error"]').closest('button').click())
    await pause(30)
    expect(tooltip()).not.toBeNull()
}
const clickLink = index => act(async () => {
    const button = links()[index]
    button.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}))
    button.click()
})
const changeName = value => act(async () => {
    const input = nameInput()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', {bubbles: true}))
})
