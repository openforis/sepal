// What the user details form lets an admin change. The form is real; the panel, inputs and
// surrounding widgets reach the store and the DOM in ways a unit test cannot serve, so they are
// passthroughs — what is under test is the state this component hands them.

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
vi.mock('~/widget/confirm', () => ({Confirm: () => null}))
vi.mock('~/widget/form', () => {
    const passthrough = ({children}) => <div>{children}</div>
    const Input = ({input, disabled}) => <input name={input?.name} disabled={disabled}/>
    return {Form: {Field: FormField, Panel: passthrough, Input, Buttons: Input, PanelButtons: passthrough}}
})
vi.mock('~/widget/layout', () => ({Layout: ({children}) => <div>{children}</div>}))
vi.mock('~/widget/panel/panel', () => ({
    Panel: {Header: ({label}) => <div>{label}</div>, Content: ({children}) => <div>{children}</div>}
}))

const {UserDetails} = await import('./userDetails')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let mounted

const render = (userDetails, props = {}) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(
        <UserDetails userDetails={userDetails} onCancel={() => {}} onSave={() => {}} {...props}/>
    ))
    mounted.push(() => {
        act(() => root.unmount())
        container.remove()
    })
    return container
}

const editableInputs = container => [...container.querySelectorAll('input')].filter(input => !input.disabled)

beforeEach(() => mounted = [])
afterEach(() => mounted.forEach(unmount => unmount()))

describe('the user details form', () => {
    it('lets the details and role be edited, not the budget', () => {
        const container = render(aUser())

        expect(editableInputs(container).map(input => input.name).sort()).toEqual(
            ['admin', 'email', 'intendedUse', 'name', 'organization']
        )
    })
})

describe('a locked user details form', () => {
    it('cannot be edited', () => {
        const container = render(aUser(), {locked: true})

        expect(editableInputs(container)).toEqual([])
    })

    it('can be edited again once unlocked', () => {
        const container = render(aUser(), {locked: false})

        expect(container.querySelector('input[name="name"]').disabled).toBe(false)
    })
})

const aUser = () => ({
    id: 1,
    revision: 1,
    username: 'bob',
    name: 'A User',
    email: 'bob@example.org',
    organization: 'FAO',
    status: 'ACTIVE',
    quota: {budget: {instanceSpending: 1, storageSpending: 1, storageQuota: 1}}
})
