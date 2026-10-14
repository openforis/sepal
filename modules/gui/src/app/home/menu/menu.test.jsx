import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, describe, expect, it, vi} from 'vitest'

const store = vi.hoisted(() => ({state: {}}))

vi.mock('~/compose', () => ({compose: (Component, ...wrappers) => wrappers.reduce((c, w) => w(c), Component)}))
vi.mock('~/connect', () => ({
    connect: mapStateToProps => Component => props => <Component {...mapStateToProps({})} {...props}/>
}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/store', () => ({select: path => store.state[path]}))
vi.mock('~/user', () => ({currentUser: () => ({admin: false})}))
vi.mock('~/route', () => ({isPathInLocation: () => false}))
vi.mock('react-router', () => ({useLocation: () => ({pathname: '/'})}))
vi.mock('../user/usage', () => ({usageHint: () => {}}))
vi.mock('./menuMode', () => ({isFloating: () => false, MenuMode: () => null}))
vi.mock('~/widget/button', () => ({
    Button: ({route, linkUrl, tooltip, disabled}) =>
        <button data-link={route || linkUrl} data-tooltip={[tooltip].flat().filter(Boolean).join('|')} disabled={!!disabled}/>
}))

const {Menu} = await import('./menu')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('the menu while a budget limit is exceeded', () => {
    let root
    let container

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('explains on each disabled link which limit is exceeded', () => {
        render({'user.budgetExceeded': true, 'user.budgetExceededReason': 'DATA_QUOTA'})

        for (const link of ['/-/terminal', '/-/app-launch-pad', '/-/tasks']) {
            expect(button(link).disabled).toBe(true)
            expect(button(link).dataset.tooltip).toContain('error.budget.dataQuotaExceeded')
        }
    })

    it('names the instance budget when no reason has been reported', () => {
        render({'user.budgetExceeded': true})

        expect(button('/-/terminal').dataset.tooltip).toContain('error.budget.instanceBudgetExceeded')
    })

    it('leaves the links enabled, with no budget tooltip, while within limits', () => {
        render({'user.budgetExceeded': false})

        for (const link of ['/-/terminal', '/-/app-launch-pad', '/-/tasks']) {
            expect(button(link).disabled).toBe(false)
            expect(button(link).dataset.tooltip).not.toContain('error.budget')
        }
    })

    function render(state) {
        store.state = state
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
        act(() => root.render(<Menu/>))
    }

    function button(link) {
        return container.querySelector(`[data-link="${link}"]`)
    }
})
