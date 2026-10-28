import {beforeEach, describe, expect, it, vi} from 'vitest'

const {dispatched} = vi.hoisted(() => ({dispatched: []}))

vi.mock('~/store', () => ({select: vi.fn()}))
vi.mock('~/action-builder', () => ({
    actionBuilder: type => {
        const action = {type, sets: []}
        const chain = {
            set: (path, value) => {
                action.sets.push({path, value})
                return chain
            },
            dispatch: () => dispatched.push(action)
        }
        return chain
    }
}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/uuid', () => ({uuid: () => 'uuid'}))

import {reorderedTabs, setTabPlaceholder} from './tabActions'

const tab = id => ({id, title: `title-${id}`})

describe('reorderedTabs', () => {
    it('returns the tabs in the given id order', () => {
        const tabs = [tab('a'), tab('b'), tab('c')]
        expect(reorderedTabs(tabs, ['c', 'a', 'b']).map(({id}) => id))
            .toEqual(['c', 'a', 'b'])
    })

    it('preserves the current entry objects (concurrent field updates survive)', () => {
        const tabs = [tab('a'), tab('b')]
        const [first] = reorderedTabs(tabs, ['b', 'a'])
        expect(first).toBe(tabs[1])
    })

    it('ignores unknown ids', () => {
        const tabs = [tab('a'), tab('b')]
        expect(reorderedTabs(tabs, ['b', 'ghost', 'a']).map(({id}) => id))
            .toEqual(['b', 'a'])
    })

    it('keeps tabs missing from the id list, in order, at the end', () => {
        const tabs = [tab('a'), tab('b'), tab('c'), tab('d')]
        expect(reorderedTabs(tabs, ['c', 'a']).map(({id}) => id))
            .toEqual(['c', 'a', 'b', 'd'])
    })

    it('handles empty inputs', () => {
        expect(reorderedTabs([], ['a'])).toEqual([])
        expect(reorderedTabs([tab('a')], [])).toEqual([tab('a')])
    })
})

describe('setTabPlaceholder', () => {
    beforeEach(() => {
        dispatched.length = 0
    })

    it('sets the placeholder of the identified tab', () => {
        setTabPlaceholder('1: lazy-paper', 'terminal', 'tab-1')
        expect(dispatched).toEqual([{
            type: 'SET_TAB_PLACEHOLDER',
            sets: [{path: ['terminal', 'tabs', {id: 'tab-1'}, 'placeholder'], value: '1: lazy-paper'}]
        }])
    })

    // Tabs are reordered by dragging, so addressing by position would place the name on
    // whichever tab currently sits at that index.
    it('addresses the tab by id, not by position', () => {
        setTabPlaceholder('1: lazy-paper', 'terminal', 'tab-1')
        expect(dispatched[0].sets[0].path).toContainEqual({id: 'tab-1'})
    })

    it('restores the default label when there is no placeholder', () => {
        setTabPlaceholder('', 'terminal', 'tab-1')
        expect(dispatched[0].sets[0].value).toBe('widget.tabs.newTab')
    })
})
