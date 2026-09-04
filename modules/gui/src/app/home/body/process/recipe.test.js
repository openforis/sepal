import {beforeEach, expect, test, vi} from 'vitest'

const dispatched = []

vi.mock('~/store', () => ({
    select: () => undefined,
    subscribe: () => () => {}
}))

vi.mock('~/action-builder', () => {
    const builder = () => {
        const sets = {}
        const self = {
            set: (path, value) => {
                sets[JSON.stringify(path)] = value
                return self
            },
            push: () => self,
            del: () => self,
            dispatch: () => dispatched.push(sets)
        }
        return self
    }
    return {actionBuilder: builder, scopedActionBuilder: () => builder}
})

vi.mock('~/widget/tabs/tabActions', () => ({
    addTab: () => ({id: 'copy-id', type: 'process', placeholder: 'new'}),
    closeTab: () => {}
}))

vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))

const {duplicateRecipe, recipePath} = await import('./recipe')

beforeEach(() => {
    dispatched.length = 0
})

test('a duplicated recipe does not retain the source revision', () => {
    duplicateRecipe({id: 'r1', type: 'MOSAIC', title: 'Original', revision: 7, model: {a: 1}, ui: {}})

    const copy = dispatched.at(-1)[JSON.stringify(recipePath('copy-id'))]
    expect(copy.revision).toBeUndefined()
    expect(copy.model).toEqual({a: 1})
})
