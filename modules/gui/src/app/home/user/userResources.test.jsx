// What the resources section shows. connect() is mocked away, so the report is passed in directly.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => component => component}))
vi.mock('~/store', () => ({select: () => null}))

import {setLanguage, TranslationProvider} from '~/translate'

import {UserResources} from './userResources'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

describe('the user resources', () => {
    let mounted

    beforeEach(() => {
        mounted = []
    })
    afterEach(() => mounted.forEach(unmount => unmount()))

    it('shows what is used left of the bar of each resource, and the maximum right of it', () => {
        expect(cells(render(spending()))).toEqual([
            'Used', 'Max',
            'Instance spending', '12%', 'Using 12% of allocated quota', '$ 100/mo.',
            'Storage spending', '50%', 'Using 50% of allocated quota', '$ 2.00/mo.',
            'Storage space', '25%', 'Using 25% of allocated quota', '20.0 GB'
        ])
    })

    it('fills each bar up to what is used', () => {
        const [instanceSpending] = meters(render(spending()))

        expect(instanceSpending.firstChild.style.width).toBe('12%')
    })

    it('stops the bar at the end of its line when over budget, reporting the true percentage', () => {
        const [instanceSpending] = meters(render(spending({monthlyInstanceSpending: 150})))

        expect(instanceSpending.firstChild.style.width).toBe('100%')
        expect(instanceSpending.getAttribute('aria-label')).toBe('Using 150% of allocated quota')
    })

    it.each([
        {used: 70, color: 'var(--success-color)'},
        {used: 71, color: 'var(--warning-color)'},
        {used: 90, color: 'var(--warning-color)'},
        {used: 91, color: 'var(--error-color)'}
    ])('colours a bar $color at $used% used', ({used, color}) => {
        const [instanceSpending] = meters(render(spending({monthlyInstanceSpending: used})))

        expect(instanceSpending.style.getPropertyValue('--color')).toBe(color)
    })

    it('shows nothing used of a resource with no budget', () => {
        const [instanceSpending] = meters(render(spending({monthlyInstanceSpending: 3, monthlyInstanceBudget: 0})))

        expect(instanceSpending.firstChild.style.width).toBe('0%')
    })

    it('shows nothing until the report has loaded', () => {
        expect(render(undefined).textContent).toBe('')
    })

    const render = spending => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(
            <TranslationProvider>
                <UserResources userReport={{spending}}/>
            </TranslationProvider>
        ))
        mounted.push(() => {
            act(() => root.unmount())
            container.remove()
        })
        return container
    }
})

const spending = overrides => ({
    monthlyInstanceSpending: 12,
    monthlyInstanceBudget: 100,
    monthlyStorageSpending: 1,
    monthlyStorageBudget: 2,
    storageUsed: 5,
    storageQuota: 20,
    ...overrides
})

const meters = container => [...container.querySelectorAll('[role=img]')]

const cells = container => [...container.firstChild.children]
    .map(cell => cell.getAttribute('aria-label') ?? cell.textContent)
    .filter(Boolean)
