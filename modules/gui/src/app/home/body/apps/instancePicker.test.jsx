// What the instance picker offers, with and without an app to place. The combo and panel reach the store
// and the DOM in ways a unit test cannot serve, so they are passthroughs that show their sections and
// value; the HOCs are replaced by the props they would inject.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => component => component}))
vi.mock('~/subscription', () => ({withSubscriptions: () => component => component}))
vi.mock('~/apps', () => ({appList: () => []}))
vi.mock('~/apiRegistry', () => ({default: {user: {loadCurrentUserReport$: vi.fn()}}}))
vi.mock('~/widget/combo', () => ({
    Combo: ({options, value}) =>
        <div className='combo' data-value={value}>
            {options.map(({label, options}) =>
                <section key={label} data-label={label}>
                    {options.map(({value}) => <div key={value} className='option'>{value}</div>)}
                </section>
            )}
        </div>
}))
vi.mock('~/widget/panel/panel', () => {
    const Panel = ({children}) => <div>{children}</div>
    Panel.Header = ({title}) => <h1>{title}</h1>
    Panel.Content = ({children}) => <div>{children}</div>
    const Buttons = ({children}) => <div>{children}</div>
    Buttons.Main = ({children}) => <div>{children}</div>
    Buttons.Extra = ({children}) => <div>{children}</div>
    Buttons.Confirm = ({onClick, disabled}) => <button className='confirm' disabled={disabled} onClick={onClick}/>
    Buttons.Cancel = ({onClick}) => <button className='cancel' onClick={onClick}/>
    Panel.Buttons = Buttons
    return {Panel}
})

import api from '~/apiRegistry'
import {setLanguage, TranslationProvider} from '~/translate'

import {InstancePicker} from './instancePicker'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

const T3 = {id: 'T3aSmall', name: 't3a.small', tag: 't1', cpuCount: 1, ramGiB: 2, hourlyCost: 0.0204, gpuCount: 0}
const M6 = {id: 'M6aXlarge', name: 'm6a.xlarge', tag: 'm4', cpuCount: 4, ramGiB: 16, hourlyCost: 0.1926, gpuCount: 0}

const report = {
    sessions: [{id: 's1', name: 'humble-robin', instanceType: M6, apps: []}],
    instanceTypes: [M6, T3]
}

describe('the instance picker', () => {
    let mounted

    const render = ({app, onConfirm = vi.fn()} = {}) => {
        const subscriptions = []
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(
            <TranslationProvider>
                <InstancePicker
                    app={app}
                    onConfirm={onConfirm}
                    onCancel={vi.fn()}
                    addSubscription={subscription => subscriptions.push(subscription)}/>
            </TranslationProvider>
        ))
        mounted.push(() => {
            act(() => root.unmount())
            subscriptions.forEach(subscription => subscription.unsubscribe())
            container.remove()
        })
        return container
    }

    beforeEach(() => {
        mounted = []
        vi.mocked(api.user.loadCurrentUserReport$).mockReturnValue(of(report))
    })
    afterEach(() => mounted.forEach(unmount => unmount()))

    describe('without an app', () => {
        it('offers only new instance types, preselecting the cheapest', () => {
            const container = render()

            expect(container.querySelector('h1').textContent).toBe('Start new instance')
            expect(sectionLabels(container)).toEqual(['New instance without SSD'])
            expect(options(container)).toEqual(['type:M6aXlarge', 'type:T3aSmall'])
            expect(container.querySelector('.combo').dataset.value).toBe('type:T3aSmall')
        })

        it('confirms the picked instance type', () => {
            const onConfirm = vi.fn()
            const container = render({onConfirm})

            act(() => container.querySelector('.confirm').click())

            expect(onConfirm).toHaveBeenCalledWith({instanceType: 'T3aSmall'})
        })
    })

    describe('for an app', () => {
        const app = {path: '/sandbox/jupyter', label: 'Jupyter', endpoint: 'jupyter'}

        it('also offers the running instances, preselecting the first suitable one', () => {
            const container = render({app})

            expect(container.querySelector('h1').textContent).toBe('Start Jupyter')
            expect(sectionLabels(container)).toEqual(['Running instances', 'New instance without SSD'])
            expect(container.querySelector('.combo').dataset.value).toBe('session:s1')
        })
    })
})

const sectionLabels = container =>
    [...container.querySelectorAll('section')].map(({dataset}) => dataset.label)

const options = container =>
    [...container.querySelectorAll('.option')].map(({textContent}) => textContent)
