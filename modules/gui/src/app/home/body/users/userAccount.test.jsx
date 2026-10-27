// What the user panel lets an admin change, and which account actions it offers. The form is real;
// the panel, inputs and surrounding widgets reach the store and the DOM in ways a unit test cannot
// serve, so they are passthroughs — what is under test is the state this component hands them.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FormField} from '~/widget/form/property'

// The form's initial values come from mapStateToProps, which only reads the component's own props.
vi.mock('~/connect', () => ({
    connect: mapStateToProps => Component => props =>
        <Component {...props} {...(mapStateToProps ? mapStateToProps({}, props) : {})}/>
}))
vi.mock('~/translate', () => ({msg: key => key}))
const store = {currentUser: {username: 'admin'}}
vi.mock('~/user', () => ({currentUser: () => store.currentUser, requestPasswordReset$: () => {}}))
vi.mock('~/widget/button', () => ({
    Button: ({label, disabled, onClick}) => <button data-label={label} disabled={disabled} onClick={onClick}/>
}))
vi.mock('~/widget/form', () => {
    const passthrough = ({children}) => <div>{children}</div>
    const Input = ({input, disabled}) => <input name={input?.name} disabled={disabled}/>
    return {Form: {Field: FormField, Panel: passthrough, Input, Buttons: () => null, FieldSet: passthrough, PanelButtons: passthrough}}
})
vi.mock('~/widget/input', () => ({
    Input: ({value, readOnly}) => <input defaultValue={value} readOnly={readOnly}/>
}))
vi.mock('~/widget/layout', () => ({Layout: ({children}) => <div>{children}</div>}))
vi.mock('~/widget/notifications', () => ({Notifications: {success: () => {}}}))
vi.mock('~/widget/panel/panel', () => ({Panel: {Header: () => null, Content: ({children}) => <div>{children}</div>}}))
vi.mock('~/widget/tag', () => ({Tag: () => null}))
vi.mock('~/widget/modalConfirmationButton', () => ({
    ModalConfirmationButton: ({label, disabled}) => <button data-label={label} disabled={disabled}/>
}))
vi.mock('./userActivity', () => ({UserActivity: () => null}))
vi.mock('~/app/home/user/usageStatistics', () => ({UsageStatistics: () => null}))
vi.mock('./userStatus', () => {
    const UserStatus = () => null
    UserStatus.isLocked = status => status === 'LOCKED'
    return {UserStatus}
})

const {UserBudget} = await import('./userBudget')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let mounted

const render = (userDetails, props = {}) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(
        <UserBudget
            userDetails={userDetails}
            onCancel={() => {}}
            onEditDetails={() => {}}
            onSave={() => {}}
            onLock={() => {}}
            onUnlock={() => {}}
            {...props}
        />
    ))
    mounted.push(() => {
        act(() => root.unmount())
        container.remove()
    })
    return container
}

const button = (container, label) => container.querySelector(`button[data-label="${label}"]`)
const editableInputs = container => [...container.querySelectorAll('input')].filter(input => !input.disabled && !input.readOnly)

beforeEach(() => mounted = [])
afterEach(() => mounted.forEach(unmount => unmount()))

describe('the user panel', () => {
    it('shows the user details', () => {
        const user = aUser({username: 'bob'})

        const container = render(user)

        for (const value of [user.username, user.name, user.email, user.organization, user.intendedUse]) {
            expect(container.textContent).toContain(value)
        }
    })

    it('lets only the budget be edited', () => {
        const container = render(aUser({username: 'bob'}))

        expect(editableInputs(container).map(input => input.name)).toEqual(['instanceSpending', 'storageSpending', 'storageQuota'])
    })

    it('opens the user details from its footer', () => {
        const onEditDetails = vi.fn()
        const container = render(aUser({username: 'bob'}), {onEditDetails})

        act(() => button(container, 'user.userBudget.editDetails.label').click())

        expect(onEditDetails).toHaveBeenCalled()
    })
})

describe('lock and unlock buttons', () => {
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

describe('a locked user panel', () => {
    it('cannot be edited', () => {
        const container = render(aUser({username: 'bob'}), {locked: true})

        expect(editableInputs(container)).toEqual([])
    })

    it('offers no account actions', () => {
        const container = render(aUser({username: 'bob'}), {locked: true})

        expect(button(container, 'user.userBudget.editDetails.label').disabled).toBe(true)
        expect(button(container, 'user.userDetails.lock.label').disabled).toBe(true)
        expect(button(container, 'user.userDetails.resetPassword.label').disabled).toBe(true)
    })
})

const aUser = ({username, status = 'ACTIVE'}) => ({
    id: 1,
    username,
    name: 'A User',
    email: `${username}@example.org`,
    organization: 'FAO',
    intendedUse: 'Mapping forests',
    status,
    quota: {budget: {instanceSpending: 1, storageSpending: 1, storageQuota: 1}}
})
