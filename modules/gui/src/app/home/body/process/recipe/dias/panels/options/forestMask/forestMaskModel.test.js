import {describe, expect, it} from 'vitest'

import {forestMaskToValues, toForestMask} from './forestMaskModel'

describe('a forest mask held by the options', () => {
    const masks = [
        {type: 'NONE'},
        {type: 'HANSEN', threshold: 45},
        {type: 'ASSET', id: 'projects/p/assets/forest'},
        {type: 'RECIPE_REF', id: 'forest-recipe'}
    ]

    for (const forestMask of masks) {
        it(`is saved as opened when ${forestMask.type}`, () => {
            expect(toForestMask(forestMaskToValues(forestMask))).toEqual(forestMask)
        })
    }

    it('opens with no choice made when none is held', () => {
        expect(forestMaskToValues(undefined)).toEqual({})
    })
})
