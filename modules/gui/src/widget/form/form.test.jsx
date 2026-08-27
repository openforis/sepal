import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// withForm composes with the Redux connect HOC, which the form contract itself needs nothing from.
vi.mock('~/connect', () => ({connect: () => Component => Component}))

import {withForm} from './form'
import {FormField} from './property'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Dirtiness is a property of the WHOLE form: it is what decides whether a panel offers to apply and whether the
// recipe is marked edited. `setInitialValue` exists for values a panel LEARNS rather than values a user
// changes - a selection's default, a resolved country id - so it must set that one field's baseline without
// making any claim about the fields the user has been editing.
describe('withForm dirty state', () => {
    const fields = {user: new FormField(), derived: new FormField()}

    let form, inputs, notifications, mounted

    const mount = (values = {user: 'a', derived: 'b'}) => {
        const Harness = props => {
            form = props.form
            inputs = props.inputs
            return null
        }
        const Wrapped = withForm({fields})(Harness)
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(<Wrapped values={values}/>))
        mounted.push(() => {
            act(() => root.unmount())
            container.remove()
        })
        form.onDirtyChanged(dirty => notifications.push(dirty))
    }

    beforeEach(() => {
        notifications = []
        mounted = []
    })

    // Every mounted root is torn down after its own test, including the last one: cleaning up on the way IN
    // would leave the final test's root and container attached for the rest of the run.
    afterEach(() => {
        mounted.forEach(unmount => unmount())
        mounted = []
    })

    it('starts clean', () => {
        mount()
        expect(form.isDirty()).toBe(false)
        expect(notifications).toEqual([])
    })

    it('reports a user edit once', () => {
        mount()
        act(() => inputs.user.set('edited'))
        expect(form.isDirty()).toBe(true)
        expect(notifications).toEqual([true])
    })

    // The defect this exists for: a panel learning a derived default while the user has unsaved edits must not
    // announce that the form is clean, or navigation treats an edited panel as safe to discard.
    it('does not clean unrelated user edits when a derived field learns its baseline', () => {
        mount()
        act(() => inputs.user.set('edited'))
        act(() => inputs.derived.setInitialValue('learned'))
        expect(form.isDirty()).toBe(true)
        expect(notifications).toEqual([true])
    })

    it('becomes clean exactly once when the user edit is undone', () => {
        mount()
        act(() => inputs.user.set('edited'))
        act(() => inputs.derived.setInitialValue('learned'))
        act(() => inputs.user.set('a'))
        expect(form.isDirty()).toBe(false)
        expect(notifications).toEqual([true, false])
    })

    it('cleans the form when applied to its only dirty field', () => {
        mount()
        act(() => inputs.user.set('edited'))
        act(() => inputs.user.setInitialValue('edited'))
        expect(form.isDirty()).toBe(false)
        expect(notifications).toEqual([true, false])
    })

    it('leaves a clean form clean, and silent', () => {
        mount()
        act(() => inputs.derived.setInitialValue('learned'))
        expect(form.isDirty()).toBe(false)
        expect(notifications).toEqual([])
    })

    // What countrySection does: resolve a code into the field and treat it as where the field started.
    it('adopts the value as the field baseline', () => {
        mount()
        act(() => inputs.derived.setInitialValue('learned'))
        expect(inputs.derived.value).toBe('learned')
        expect(inputs.derived.isDirty()).toBe(false)
    })
})
