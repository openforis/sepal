import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, describe, expect, it, vi} from 'vitest'

const store = vi.hoisted(() => ({state: {}}))

vi.mock('~/compose', () => ({compose: (Component, ...wrappers) => wrappers.reduce((c, w) => w(c), Component)}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/store', () => ({select: path => store.state[path]}))
vi.mock('~/app/home/user/usage', () => ({usageHint: () => {}}))
vi.mock('~/stateUtils', () => ({selectFrom: () => true}))
vi.mock('../recipeContext', () => ({
    withRecipe: mapRecipeToProps => Component => props => <Component {...mapRecipeToProps({})} {...props}/>
}))
vi.mock('~/widget/toolbar/toolbarActivationButton', () => ({
    ToolbarActivationButton: ({tooltip, disabled}) =>
        <button data-tooltip={[tooltip].flat().filter(Boolean).join('|')} disabled={!!disabled}/>
}))

const {RetrieveButton} = await import('./retrieveButton')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('the Retrieve button', () => {
    let root
    let container

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('is disabled and explains which limit is exceeded', () => {
        render({'user.budgetExceeded': true, 'user.budgetExceededReason': 'DATA_QUOTA'})

        expect(button().disabled).toBe(true)
        expect(button().dataset.tooltip).toContain('error.budget.dataQuotaExceeded')
    })

    it('is enabled, with no budget tooltip, within limits', () => {
        render({'user.budgetExceeded': false})

        expect(button().disabled).toBe(false)
        expect(button().dataset.tooltip).not.toContain('error.budget')
    })

    function render(state) {
        store.state = state
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
        act(() => root.render(<RetrieveButton/>))
    }

    function button() {
        return container.querySelector('button')
    }
})
