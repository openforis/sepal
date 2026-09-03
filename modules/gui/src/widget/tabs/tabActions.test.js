import {describe, expect, it, vi} from 'vitest'

vi.mock('~/store', () => ({select: vi.fn()}))
vi.mock('~/action-builder', () => ({actionBuilder: vi.fn()}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/uuid', () => ({uuid: () => 'uuid'}))

import {reorderedTabs} from './tabActions'

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
