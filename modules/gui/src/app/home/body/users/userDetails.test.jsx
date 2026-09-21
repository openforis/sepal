// Whether the lock/unlock button in a user's details is offered. The form is real; the panel, inputs
// and surrounding widgets reach the store and the DOM in ways a unit test cannot serve, so they are
// passthroughs — what is under test is the button state this component hands them.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FormField} from '~/widget/form/property'

// The form's initial values come from mapStateToProps, which only reads the component's own props.
vi.mock('~/connect', () => ({
    connect: mapStateToProps => Component => props =>
        <Component {...props} {...(mapStateToProps ? mapStateToProps({}, props) : {})}/>
}))
vi.mock('~/store', () => ({select: () => null}))
vi.mock('~/translate', () => ({msg: key => key}))
const store = {currentUser: {username: 'admin'}}
vi.mock('~/user', () => ({currentUser: () => store.currentUser, requestPasswordReset$: () => {}}))
vi.mock('~/widget/confirm', () => ({Confirm: () => null}))
vi.mock('~/widget/form', () => {
    const passthrough = ({children}) => <div>{children}</div>
    const Input = ({input, disabled}) => <input name={input?.name} disabled={disabled}/>
    return {Form: {Field: FormField, Panel: passthrough, Input, Buttons: () => null, FieldSet: passthrough, PanelButtons: passthrough}}
})
vi.mock('~/widget/input', () => ({Input: () => null}))
vi.mock('~/widget/layout', () => ({Layout: ({children}) => <div>{children}</div>}))
vi.mock('~/widget/notifications', () => ({Notifications: {success: () => {}}}))
vi.mock('~/widget/panel/panel', () => ({Panel: {Header: () => null, Content: ({children}) => <div>{children}</div>}}))
vi.mock('~/widget/modalConfirmationButton', () => ({
    ModalConfirmationButton: ({label, disabled}) => <button data-label={label} disabled={disabled}/>
}))
vi.mock('./userActivity', () => ({UserActivity: () => null}))
vi.mock('./userUsage', () => ({UserUsage: () => null}))
vi.mock('./userStatus', () => {
    const UserStatus = () => null
    UserStatus.isLocked = status => status === 'LOCKED'
    return {UserStatus}
})

const {UserDetails} = await import('./userDetails')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('lock and unlock buttons', () => {
    let mounted

    const render = (userDetails, props = {}) => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(
            <UserDetails userDetails={userDetails} onCancel={() => {}} onSave={() => {}} onLock={() => {}} onUnlock={() => {}} {...props}/>
        ))
        mounted.push(() => {
            act(() => root.unmount())
            container.remove()
        })
        return container
    }

    const button = (container, label) => container.querySelector(`button[data-label="${label}"]`)

    beforeEach(() => mounted = [])
    afterEach(() => mounted.forEach(unmount => unmount()))

    it('offers to lock another user', () => {
        const container = render(aUser({username: 'bob'}))

        expect(button(container, 'user.userDetails.lock.label').disabled).toBe(false)
    })

    it('does not offer to lock the current user', () => {
        const container = render(aUser({username: store.currentUser.username}))

        expect(button(container, 'user.userDetails.lock.label').disabled).toBe(true)
    })

    it('offers to unlock another user', () => {
        const container = render(aUser({username: 'bob', status: 'LOCKED'}))

        expect(button(container, 'user.userDetails.unlock.label').disabled).toBe(false)
    })

    it('does not offer to unlock the current user', () => {
        const container = render(aUser({username: store.currentUser.username, status: 'LOCKED'}))

        expect(button(container, 'user.userDetails.unlock.label').disabled).toBe(true)
    })
})

describe('a locked record', () => {
    let mounted

    const render = (userDetails, props = {}) => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(
            <UserDetails userDetails={userDetails} onCancel={() => {}} onSave={() => {}} onLock={() => {}} onUnlock={() => {}} {...props}/>
        ))
        mounted.push(() => {
            act(() => root.unmount())
            container.remove()
        })
        return container
    }

    const button = (container, label) => container.querySelector(`button[data-label="${label}"]`)

    beforeEach(() => mounted = [])
    afterEach(() => mounted.forEach(unmount => unmount()))

    it('cannot be edited', () => {
        const container = render(aUser({username: 'bob'}), {locked: true})

        const editable = [...container.querySelectorAll('input')].filter(input => !input.disabled)
        expect(editable).toEqual([])
    })

    it('cannot be locked or have its password reset', () => {
        const container = render(aUser({username: 'bob'}), {locked: true})

        expect(button(container, 'user.userDetails.lock.label').disabled).toBe(true)
        expect(button(container, 'user.userDetails.resetPassword.label').disabled).toBe(true)
    })

    it('can be edited again once unlocked', () => {
        const container = render(aUser({username: 'bob'}), {locked: false})

        expect(container.querySelector('input[name="name"]').disabled).toBe(false)
    })
})

const aUser = ({username, status = 'ACTIVE'}) => ({
    id: 1,
    username,
    name: 'A User',
    email: `${username}@example.org`,
    organization: 'FAO',
    status,
    quota: {budget: {instanceSpending: 1, storageSpending: 1, storageQuota: 1}}
})
