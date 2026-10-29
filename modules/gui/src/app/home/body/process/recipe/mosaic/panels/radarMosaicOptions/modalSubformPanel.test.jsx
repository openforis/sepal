import {act, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, expect, it, vi} from 'vitest'

import {assetProcessing, effectiveSettings} from '#sepal/recipe/changeAlerts/processing'
import {initStore} from '~/store'

// Keep the real form state and modal lifecycle; the shell exposes its Apply/Cancel without portals.
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => {
        const [active, setActive] = useState(true)
        return active ? <Component {...props} activatable={{deactivate: () => setActive(false)}}/> : null
    }
}))
vi.mock('~/widget/form', () => ({Form: {
    Panel: ({form, onApply, onCancel, children}) => <div>
        {children}
        <button disabled={!form.isDirty() || form.isInvalid()} onClick={() => onApply(form.values())}>Apply details</button>
        <button onClick={onCancel}>Cancel details</button>
    </div>,
    PanelButtons: () => null
}}))
vi.mock('~/widget/panel/panel', () => ({Panel: {Header: () => null, Content: ({children}) => children}}))
vi.mock('~/translate', () => ({msg: key => key}))

const {modalSubformPanel} = await import('./modalSubformPanel')
const {FormField} = await import('~/widget/form/property')
const {presentProcessingInputs, preserveProcessingCopies} = await import('../../../changeAlerts/processingSettings')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const Details = modalSubformPanel({
    id: 'radar-details', fields: {kernelSize: new FormField(), sigma: new FormField()},
    toTitle: () => '', toClassName: () => ''
})(({inputs}) => Object.entries(inputs).map(([name, input]) => <input key={name} aria-label={name}
    value={input.value ?? ''} disabled={input.presentation?.(name).disabled}
    onChange={event => input.set(Number(event.target.value))}/>))

const INITIAL = {kernelSize: 17, sigma: 0.9}
let root, container

afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
})

const open = async ({recorded = true} = {}) => {
    const saved = vi.fn()
    let refresh
    const Parent = () => {
        const [options, setOptions] = useState(INITIAL)
        const [kernelSize, setKernelSize] = useState(5)
        refresh = setKernelSize
        const settings = effectiveSettings({options}, assetProcessing(recorded ? {recipe_options: JSON.stringify({kernelSize})} : {}))
        const inputs = Object.fromEntries(Object.entries(options).map(([name, value]) => [name, {
            name, value, set: next => setOptions(previous => ({...previous, [name]: next}))
        }]))
        const presented = presentProcessingInputs(settings)(inputs, model => model)
        return <>
            <Details inputsToUpdate={presented}/>
            <output>{JSON.stringify(options)}</output>
            <button onClick={() => saved(preserveProcessingCopies(settings)(options, INITIAL))}>Save processing</button>
        </>
    }
    const store = createStore((state = {}) => state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<Provider store={store}><Parent/></Provider>))
    return {saved, refresh: value => act(async () => refresh(value))}
}

it.each(['Apply', 'Cancel'])('keeps a mixed-ownership draft through reference updates, then %s without saving reference copies', async action => {
    const {saved, refresh} = await open()
    expect(input('kernelSize').disabled).toBe(true)
    expect(input('kernelSize').value).toBe('5')
    expect(input('sigma').disabled).toBe(false)
    await change('sigma', 0.7)
    await refresh(7)
    expect(input('kernelSize').value).toBe('7')
    expect(input('sigma').value).toBe('0.7')
    expect(JSON.parse(container.querySelector('output').textContent)).toEqual(INITIAL)
    await click(`${action} details`)
    await click('Save processing')
    expect(saved).toHaveBeenCalledWith({kernelSize: INITIAL.kernelSize, sigma: action === 'Apply' ? 0.7 : INITIAL.sigma})
})

it('keeps ordinary radar details editable and applies both values', async () => {
    const {saved} = await open({recorded: false})
    expect(input('kernelSize').disabled).toBe(false)
    await change('kernelSize', 7)
    await change('sigma', 0.7)
    await click('Apply details')
    await click('Save processing')
    expect(saved).toHaveBeenCalledWith({kernelSize: 7, sigma: 0.7})
})

const input = name => container.querySelector(`input[aria-label="${name}"]`)
const change = (name, value) => act(async () => {
    const element = input(name)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(value))
    element.dispatchEvent(new Event('input', {bubbles: true}))
})
const click = label => act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === label).click())
