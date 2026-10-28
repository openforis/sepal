// The button that applies held-back live changes floats over the list instead of sitting in its
// header, and is only offered while changes are waiting. It floats within the users section, which
// stays mounted once visited, so it must not linger over other sections. The list's own widgets
// reach the store and the DOM in ways a unit test cannot serve, so they are passthroughs; the
// button and its portal are real.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/layout', () => {
    const Layout = ({children}) => <div>{children}</div>
    Layout.Spacer = () => null
    return {Layout}
})
vi.mock('~/widget/sectionLayout', () => ({
    SectionLayout: ({children}) => <div>{children}</div>,
    Content: ({children}) => <div>{children}</div>
}))
vi.mock('~/widget/scrollable', () => ({Scrollable: ({children}) => <div>{children}</div>}))
vi.mock('~/widget/searchBox', () => ({SearchBox: () => null}))
vi.mock('~/widget/buttons', () => ({Buttons: () => null}))
vi.mock('~/widget/fastList', () => ({FastList: () => null}))
vi.mock('~/widget/sortButton', () => ({SortButton: () => null}))
vi.mock('~/widget/label', () => ({Label: () => null}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('~/app/home/user/userResourceUsage', () => ({UserResourceUsage: () => null}))
vi.mock('./userActivity', () => ({UserActivity: () => null}))
vi.mock('./userStatus', () => ({UserStatus: () => null}))

import {DEFAULT_PORTAL_CONTAINER_ID, PortalContainer, PortalContext} from '~/widget/portal'

const {UserList} = await import('./userList')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const SECTION_PORTAL_CONTAINER_ID = 'usersSectionPortalContainer'

describe('applying held-back changes', () => {
    let root
    let mountPoint

    const render = props => act(() => root.render(
        <>
            <PortalContainer/>
            <PortalContext id={SECTION_PORTAL_CONTAINER_ID}>
                <PortalContainer id={SECTION_PORTAL_CONTAINER_ID}/>
                <UserList users={[]} onSelect={() => {}} onUpdate={() => {}} {...props}/>
            </PortalContext>
        </>
    ))

    const globalContainer = () => document.getElementById(DEFAULT_PORTAL_CONTAINER_ID)
    const sectionContainer = () => document.getElementById(SECTION_PORTAL_CONTAINER_ID)
    const updateButton = () => document.querySelector('button')
    const click = element => act(() => element.dispatchEvent(new MouseEvent('click', {bubbles: true})))

    beforeEach(() => {
        mountPoint = document.createElement('div')
        document.body.appendChild(mountPoint)
        root = createRoot(mountPoint)
    })

    afterEach(() => {
        act(() => root.unmount())
        mountPoint.remove()
    })

    it('floats the update button over the users section while changes are waiting', () => {
        const onUpdate = vi.fn()
        render({updatePending: true, onUpdate})

        click(updateButton())

        expect(sectionContainer().contains(updateButton())).toBe(true)
        expect(globalContainer().contains(updateButton())).toBe(false)
        expect(onUpdate).toHaveBeenCalledTimes(1)
    })

    it('offers no update button while nothing is waiting', () => {
        render({updatePending: false})

        expect(updateButton()).toBeNull()
    })
})
