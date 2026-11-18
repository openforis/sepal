// What the app list offers for retired and Google-account apps. The store, the virtual list and
// the panels need more than a unit test can serve, so they are passthroughs; tooltips record
// their message so a row's hover text can be read.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {tooltips, account} = vi.hoisted(() => ({tooltips: [], account: {serviceAccount: false}}))

vi.mock('~/connect', () => ({connect: () => component => component}))
vi.mock('~/apps', () => ({loadApps$: vi.fn()}))
vi.mock('~/user', () => ({isServiceAccount: () => account.serviceAccount, currentUser: () => ({})}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => null}))
vi.mock('~/widget/userAgent', () => ({isMobile: () => false}))
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, children}) => {
        tooltips.push(msg)
        return children
    }
}))
vi.mock('~/widget/fastList', () => ({
    FastList: ({items, itemRenderer}) =>
        items.map(item => <div key={item.id} data-app={item.id}>{itemRenderer(item, false)}</div>)
}))
vi.mock('~/widget/panel/panel', () => {
    const Panel = ({children}) => <div className='details'>{children}</div>
    Panel.Header = ({children}) => <div>{children}</div>
    Panel.Content = ({children}) => <div>{children}</div>
    const Buttons = ({children}) => <div>{children}</div>
    Buttons.Main = ({children}) => <div>{children}</div>
    Buttons.Close = () => null
    Panel.Buttons = Buttons
    return {Panel}
})

import {setLanguage, TranslationProvider} from '~/translate'
import crudItemStyles from '~/widget/crudItem.module.css'
import {EventShield} from '~/widget/eventShield'

import {AppList} from './appList'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

describe('a retired app', () => {
    const retired = app({id: 'old', retiredOn: '2026-11-01', retirementReason: 'Replaced by the new one'})

    it('stays listed, dimmed, and says when it was retired', () => {
        vi.setSystemTime(new Date('2026-11-12T10:00:00Z'))
        const list = render({apps: [retired]})
        expect(isDimmed(row(list, retired))).toBe(true)
        expect(tooltips).toContain('This app was retired on Nov 1, 2026 and can no longer be started. It will be removed from the list on Dec 31, 2026. Replaced by the new one')
    })

    it('does not start when clicked', () => {
        vi.setSystemTime(new Date('2026-11-12T10:00:00Z'))
        const onSelect = vi.fn()
        const list = render({apps: [retired], onSelect})
        act(() => row(list, retired).firstChild.click())
        expect(onSelect).not.toHaveBeenCalled()
    })

    it('opens its information with the reason and the removal date', () => {
        vi.setSystemTime(new Date('2026-11-12T10:00:00Z'))
        const list = render({apps: [retired]})
        act(() => infoButton(row(list, retired)).click())
        const details = list.querySelector('.details').textContent
        expect(details).toContain('Replaced by the new one')
        expect(details).toContain('It will be removed from the list on Dec 31, 2026.')
    })

    it('shows only its Retired tag, even when it needs a Google account and an instance-free start', () => {
        vi.setSystemTime(new Date('2026-11-12T10:00:00Z'))
        account.serviceAccount = true
        const retiredGoogleApp = app({id: 'old', retiredOn: '2026-11-01', googleAccountRequired: true, endpoint: 'docker'})
        const tags = rowText(render({apps: [retiredGoogleApp]}), retiredGoogleApp)
        expect(tags).toContain('Retired')
        expect(tags).not.toContain('Google account')
        expect(tags).not.toContain('Instant')
    })

    it('leaves the list 60 days after its retirement date', () => {
        vi.setSystemTime(new Date('2026-12-31T00:00:00Z'))
        const list = render({apps: [retired, app({id: 'current'})]})
        expect(listedIds(list)).toEqual(['current'])
    })
})

describe('an app that needs a Google account', () => {
    const googleApp = app({id: 'gee', googleAccountRequired: true})

    it('is listed dimmed for a user without a Google account, with no filter to reveal it', () => {
        account.serviceAccount = true
        const list = render({apps: [googleApp]})
        expect(listedIds(list)).toEqual(['gee'])
        expect(isDimmed(row(list, googleApp))).toBe(true)
        expect(list.textContent).not.toContain('Show unavailable')
    })

    it('is labelled as needing a Google account, with how to connect one', () => {
        account.serviceAccount = true
        const list = render({apps: [googleApp]})
        expect(row(list, googleApp).textContent).toContain('Google account')
        expect(tooltips).toContain('This app needs a Google account. To use it, connect your SEPAL account to your Google account.')
    })

    it('shows only its Google account tag, even when it starts without an instance', () => {
        account.serviceAccount = true
        const dockerGoogleApp = app({id: 'gee', googleAccountRequired: true, endpoint: 'docker'})
        const tags = rowText(render({apps: [dockerGoogleApp]}), dockerGoogleApp)
        expect(tags).toContain('Google account')
        expect(tags).not.toContain('Instant')
    })

    it('does not start for a user without a Google account', () => {
        account.serviceAccount = true
        const onSelect = vi.fn()
        const list = render({apps: [googleApp], onSelect})
        act(() => row(list, googleApp).firstChild.click())
        expect(onSelect).not.toHaveBeenCalled()
    })

    it('starts for a user with a Google account', () => {
        const onSelect = vi.fn()
        const list = render({apps: [googleApp], onSelect})
        expect(isDimmed(row(list, googleApp))).toBe(false)
        expect(row(list, googleApp).textContent).not.toContain('Google account')
        act(() => row(list, googleApp).firstChild.click())
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({id: 'gee'}))
    })
})

describe('a running app', () => {
    const dockerApp = app({id: 'notebook', endpoint: 'docker'})

    it('is tagged Running instead of starting without an instance', () => {
        const list = render({apps: [dockerApp], tabs: [{path: dockerApp.path}]})
        expect(rowText(list, dockerApp)).toContain('Running')
        expect(rowText(list, dockerApp)).not.toContain('Instant')
    })

    it('loses the Running tag once it stops', () => {
        const list = render({apps: [dockerApp]})
        expect(rowText(list, dockerApp)).not.toContain('Running')
        expect(rowText(list, dockerApp)).toContain('Instant')
    })

    it('takes the user to its tab when Running is clicked, without starting another copy', () => {
        const runningTab = {id: 'notebook-tab', path: dockerApp.path}
        const onSelect = vi.fn()
        const onShowRunning = vi.fn()
        const list = render({apps: [dockerApp], tabs: [runningTab], onSelect, onShowRunning})
        act(() => chip(list, dockerApp, 'Running').click())
        expect(onShowRunning).toHaveBeenCalledWith(runningTab)
        expect(onSelect).not.toHaveBeenCalled()
    })
})

describe('a tag other than Running', () => {
    it('is no button of its own, but still explains itself', () => {
        const dockerApp = app({id: 'notebook', endpoint: 'docker'})
        const list = render({apps: [dockerApp]})
        expect(rowText(list, dockerApp)).toContain('Instant')
        expect(chip(list, dockerApp, 'Instant')).toBeUndefined()
        expect(tooltips).toContain('This app doesn\'t require a dedicated instance to run')
    })
})

describe('app information', () => {
    it('shows the release date from the catalog', () => {
        const released = app({id: 'new', releasedOn: '2025-03-12'})
        const list = render({apps: [released]})
        act(() => infoButton(row(list, released)).click())
        expect(list.querySelector('.details').textContent).toContain('Released Mar 12, 2025')
    })
})

let mounted

beforeEach(() => {
    mounted = []
    tooltips.length = 0
    account.serviceAccount = false
    vi.useFakeTimers({toFake: ['Date']})
})

afterEach(() => {
    mounted.forEach(unmount => unmount())
    vi.useRealTimers()
})

const render = ({apps, tabs = [], onSelect = vi.fn(), onShowRunning = vi.fn()}) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(
        <TranslationProvider>
            <EventShield>
                <AppList
                    apps={apps}
                    tags={[]}
                    tabs={tabs}
                    filterValues={[]}
                    tagFilter='IGNORE'
                    user={{}}
                    stream={() => ({active: false})}
                    onSelect={onSelect}
                    onShowRunning={onShowRunning}/>
            </EventShield>
        </TranslationProvider>
    ))
    mounted.push(() => {
        act(() => root.unmount())
        container.remove()
    })
    return container
}

const app = fields => ({label: fields.id, path: `/apps/${fields.id}`, endpoint: 'jupyter', tags: [], ...fields})

const row = (list, {id}) => list.querySelector(`[data-app="${id}"]`)

const rowText = (list, listedApp) => row(list, listedApp).textContent

const chip = (list, listedApp, label) =>
    [...row(list, listedApp).querySelectorAll('button')].find(button => button.textContent === label)

const listedIds = list => [...list.querySelectorAll('[data-app]')].map(element => element.dataset.app)

const isDimmed = element => !!element.querySelector(`.${crudItemStyles.dimmed}`)

const infoButton = element =>
    [...element.querySelectorAll('button')].find(button => button.querySelector('[data-icon="circle-info"], [data-icon="info-circle"]'))
