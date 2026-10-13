// The resource rows of the user report. connect() is mocked away, so the report is passed as the prop it would inject.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => component => component}))

import {setLanguage, TranslationProvider} from '~/translate'

import {UserResources} from './userResources'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

describe('the user resources', () => {
    const mounted = []

    afterEach(() => {
        mounted.splice(0).forEach(unmount => unmount())
    })

    it('shows the Data quota and the share of it in use', () => {
        const container = render({storageUsed: 1, storageQuota: 20, dataUsed: 4, dataQuota: 10})

        const row = rowLabelled(container, 'Data')
        expect(row.textContent).toContain('10.0 GB')
        expect(row.textContent).toContain('40%')
    })

    it('shows no Data row when the budget sends no Data quota', () => {
        const container = render({storageUsed: 1, storageQuota: 20})

        expect(rowLabelled(container, 'Data')).toBeUndefined()
        expect(rowLabelled(container, 'Storage space')).toBeDefined()
    })

    function render(spending) {
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

    function rowLabelled(container, label) {
        return [...container.querySelectorAll('div')]
            .find(div => div.firstElementChild?.textContent === label)
    }
})
