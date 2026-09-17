import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PanelContent} from '~/widget/panel/panelContent'

// A panel the wizard is walking through is a step in a sequence, and its buttons say so: Next and Done, not
// Apply. Submitting it from the keyboard has to mean the same thing, and going back has to stay possible
// while what the panel holds cannot be committed.
//
// The wizard is the context this panel is handed; these exercise what it does with it, over a real form.

const wizard = vi.hoisted(() => ({context: undefined}))

vi.mock('~/widget/panelWizard', () => ({
    withPanelWizard: () => Component => props => <Component {...props} panelWizard={wizard.context}/>
}))
vi.mock('~/translate', () => ({msg: key => key}))

// Imported piecemeal rather than through the ~/widget/form barrel, which this module is itself part of.
const {FormButtons} = await import('./buttons')
const {withForm} = await import('./form')
const {FormPanel} = await import('./panel')
const {FormPanelButtons} = await import('./panelButtons')
const {FormField} = await import('./property')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const PANEL = 'panel-under-test'
const ANOTHER_PANEL = 'another-panel'

describe('submitting a panel the wizard is walking through', () => {
    it('takes the wizard to the next step', async () => {
        await open(steps({next: vi.fn()}))
        await choose(VALID)

        await submitForm()

        expect(wizard.context.next).toHaveBeenCalled()
        expect(applied).toEqual([{choice: VALID}])
    })

    it('finishes the wizard when there is no next step', async () => {
        await open(steps({back: vi.fn()}))
        await choose(VALID)

        await submitForm()

        expect(wizard.context.done).toHaveBeenCalled()
        expect(applied).toEqual([{choice: VALID}])
    })

    it('neither applies nor moves on while what it holds is invalid', async () => {
        await open(steps({next: vi.fn()}))
        await choose(INVALID)

        await submitForm()

        expect(wizard.context.next).not.toHaveBeenCalled()
        expect(applied).toEqual([])
    })
})

describe('going back from a panel the wizard is walking through', () => {
    it('applies what it holds', async () => {
        await open(steps({back: vi.fn(), next: vi.fn()}))
        await choose(VALID)

        await click('button.back')

        expect(wizard.context.back).toHaveBeenCalled()
        expect(applied).toEqual([{choice: VALID}])
    })

    // The button is offered whenever there is a panel behind this one, and it is the way out of a step that
    // cannot be completed. Refusing to navigate would leave it enabled and inert.
    it('still goes back when what it holds is invalid, applying nothing', async () => {
        await open(steps({back: vi.fn(), next: vi.fn()}))
        await choose(INVALID)

        await click('button.back')

        expect(wizard.context.back).toHaveBeenCalled()
        expect(applied).toEqual([])
    })
})

describe('submitting a panel outside a wizard', () => {
    it('applies it', async () => {
        await open(undefined)
        await choose(VALID)

        await submitForm()

        expect(applied).toEqual([{choice: VALID}])
    })

    // A wizard may be running over other panels, and this one then offers Apply, not Next.
    it('applies a panel the running wizard does not include', async () => {
        await open(steps({wizard: [ANOTHER_PANEL], next: vi.fn()}))
        await choose(VALID)

        await submitForm()

        expect(wizard.context.next).not.toHaveBeenCalled()
        expect(applied).toEqual([{choice: VALID}])
    })
})

const INITIAL = 'initial'
const VALID = 'valid'
const INVALID = 'invalid'

const fields = {
    choice: new FormField().predicate(choice => choice !== INVALID, 'choice.invalid')
}

const Harness = withForm({fields})(({form, inputs}) =>
    <FormPanel
        id={PANEL}
        placement='inline'
        form={form}
        onApply={values => applied.push(values)}>
        <PanelContent>
            <FormButtons
                input={inputs.choice}
                options={[INITIAL, VALID, INVALID].map(value => ({value, label: value}))}/>
        </PanelContent>
        <FormPanelButtons/>
    </FormPanel>
)

// The wizard hands a panel its neighbours: a missing one means there is nothing that way.
const steps = ({wizard = [PANEL], back = false, next = false, done = vi.fn()}) => ({wizard, back, next, done})

const choose = value => click(value)

const click = label => act(async () => {
    const button = [...document.querySelectorAll('button')].find(button => button.textContent === label)
    expect(button, `no ${label} button`).toBeDefined()
    button.click()
})

const submitForm = () => act(async () => {
    const form = document.querySelector('form')
    expect(form, 'the panel has no form to submit').toBeDefined()
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', {cancelable: true}))
})

let root, container, store, applied

beforeEach(() => {
    applied = []
    wizard.context = undefined
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

const open = context => {
    wizard.context = context
    store = createStore((state = {dimensions: {width: 1024, height: 768}}, action) =>
        action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    return act(async () => root.render(
        <Provider store={store}>
            <EventShield>
                <Harness values={{choice: INITIAL}}/>
            </EventShield>
        </Provider>
    ))
}
