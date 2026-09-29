// The usage menu in the footer. ButtonSelect is a passthrough that shows what its button would carry and
// lists its options as buttons; the activation HOC is replaced by the activator prop it would inject.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/widget/activation/activator', () => ({withActivators: () => component => component}))
vi.mock('~/widget/budgetMonitor', () => ({refreshBudget: vi.fn()}))
vi.mock('~/widget/sessionMonitor', () => ({refreshSessions: vi.fn()}))
vi.mock('~/widget/buttonSelect', () => ({
    ButtonSelect: ({label, additionalClassName, hint, options}) =>
        <div className='select' data-class-name={additionalClassName} data-hint={String(hint)}>
            <div className='label'>{label}</div>
            {options.map(({value, label, disabled, onSelect}) =>
                <button key={value} className='option' disabled={disabled} onClick={() => onSelect()}>{label}</button>
            )}
        </div>
}))

import {setLanguage, TranslationProvider} from '~/translate'
import {refreshBudget} from '~/widget/budgetMonitor'
import {refreshSessions} from '~/widget/sessionMonitor'

import {UsageMenuButton} from './usageMenu'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

describe('the usage menu', () => {
    let mounted

    const render = ({activatables = allActivatable(), label = '$0.02/h', className, hint = false} = {}) => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(
            <TranslationProvider>
                <UsageMenuButton label={label} className={className} hint={hint} activator={{activatables}}/>
            </TranslationProvider>
        ))
        mounted.push(() => {
            act(() => root.unmount())
            container.remove()
        })
        return container
    }

    beforeEach(() => mounted = [])
    afterEach(() => {
        mounted.forEach(unmount => unmount())
        vi.clearAllMocks()
    })

    it('is labelled with the spending it is given and offers the usage and the sessions', () => {
        const container = render({label: '$1.23/h'})

        expect(container.querySelector('.label').textContent).toBe('$1.23/h')
        expect(optionLabels(container)).toEqual(['Usage', 'Sessions'])
    })

    it('opens the sessions panel, and only that one', () => {
        const activatables = allActivatable()
        const container = render({activatables})

        act(() => option(container, 'Sessions').click())

        expect(activatables.userSessions.activate).toHaveBeenCalled()
        expect(activatables.userReport.activate).not.toHaveBeenCalled()
    })

    it('opens the usage panel, and only that one', () => {
        const activatables = allActivatable()
        const container = render({activatables})

        act(() => option(container, 'Usage').click())

        expect(activatables.userReport.activate).toHaveBeenCalled()
        expect(activatables.userSessions.activate).not.toHaveBeenCalled()
    })

    it('refreshes budget and sessions when a panel opens', () => {
        const container = render()

        act(() => option(container, 'Sessions').click())

        expect(refreshBudget).toHaveBeenCalled()
        expect(refreshSessions).toHaveBeenCalled()
    })

    it('disables an entry whose panel cannot be opened', () => {
        const container = render({activatables: {...allActivatable(), userSessions: anActivatable({canActivate: false})}})

        expect(option(container, 'Sessions').disabled).toBe(true)
        expect(option(container, 'Usage').disabled).toBe(false)
    })

    it('carries the budget styling and the hint that points users at it', () => {
        const select = render({className: 'budgetWarning', hint: true}).querySelector('.select')

        expect(select.dataset.className).toBe('budgetWarning')
        expect(select.dataset.hint).toBe('true')
    })
})

const anActivatable = ({canActivate = true} = {}) => ({canActivate, activate: vi.fn()})

const allActivatable = () => ({
    userReport: anActivatable(),
    userSessions: anActivatable()
})

const optionLabels = container =>
    [...container.querySelectorAll('.option')].map(option => option.textContent)

const option = (container, label) =>
    [...container.querySelectorAll('.option')].find(option => option.textContent === label)
