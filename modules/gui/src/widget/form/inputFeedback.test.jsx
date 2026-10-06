import {act, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'

// A form combo over a real form, told about its input through the form it is in. withForm composes with the Redux
// connect HOC, which the form contract needs nothing from.
vi.mock('~/connect', () => ({connect: () => Component => Component}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat())}>{children}</span>
        : children
}))

const {FormCombo} = await import('./combo')
const {FormContext} = await import('./context')
const {withForm} = await import('./form')
const {withInputFeedback} = await import('./inputFeedback')
const {FormField} = await import('./property')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, input

afterEach(() => {
    act(() => root?.unmount())
    root = null
    container?.remove()
})

describe('an input told about beyond its own constraints', () => {
    it('shows the error it is told, a warning beside it, and the buttons it is given', () => {
        show({told: {error: 'Not in the reference', warning: ['Chart: no magnitude'], buttons: [<button key='refresh'>Refresh</button>]}})

        expect(said('error')).toEqual(['Not in the reference'])
        expect(said('warning')).toEqual(['Chart: no magnitude'])
        expect(offersRefresh()).toBe(true)
    })

    it('shows its own error first, then what it is told', () => {
        show({told: {error: 'Not in the reference'}})

        act(() => input.setInvalid('Required'))

        expect(said('error')).toEqual(['Required', 'Not in the reference'])
    })

    it('explains a check it waits for in its label\'s tooltip, after the tooltip it was given', () => {
        show({told: {busy: 'Checking'}, tooltip: 'What a measure is'})

        expect(said('tooltip')).toEqual(['What a measure is', 'Checking'])
    })

    it('keeps what its label holds as a check starts and settles', () => {
        show({label: <Counter/>})
        act(() => container.querySelector('[data-counter]').click())

        show({label: <Counter/>, told: {busy: 'Checking'}})
        show({label: <Counter/>})

        expect(container.querySelector('[data-counter]').textContent).toBe('1')
    })

    it('holds the form back while blocked, asked at that moment, and not otherwise', () => {
        const blocked = {now: false}
        const form = show({blocked: () => blocked.now})
        expect(form().isInvalid()).toBe(false)

        blocked.now = true

        expect(form().isInvalid()).toBe(true)
    })
})

// Label content with state of its own.
const Counter = () => {
    const [count, setCount] = useState(0)
    return <button data-counter onClick={() => setCount(count + 1)}>{count}</button>
}

const Host = withForm({fields: {measure: new FormField()}})(({inputs, form: plainForm, told, blocked, label, tooltip, onForm}) => {
    input = inputs.measure
    const form = withInputFeedback(plainForm, {feedbackOf: name => name === 'measure' ? told : null, blocked})
    onForm(form)
    return (
        <FormContext form={form}>
            <FormCombo input={inputs.measure} label={label} tooltip={tooltip} options={[{value: 'ndvi', label: 'NDVI'}]}/>
        </FormContext>
    )
})

// Renders the combo, or renders it again with what it is now told; returns the form as last rendered.
const show = ({told = {}, blocked = () => false, label = 'Measure', tooltip} = {}) => {
    let form
    if (!root) {
        initStore(createStore(state => state, {dimensions: {width: 1024, height: 768}}))
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    }
    act(() => root.render(<Host told={told} blocked={blocked} label={label} tooltip={tooltip} onForm={next => form = next}/>))
    return () => form
}

// What the combo's label says: its errors, warnings or tooltip, as the tooltip of the icon marking them.
const said = kind => {
    const tooltip = container.querySelector(`[data-feedback="${kind}"]`)?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const offersRefresh = () => [...container.querySelectorAll('button')].some(button => button.textContent === 'Refresh')
