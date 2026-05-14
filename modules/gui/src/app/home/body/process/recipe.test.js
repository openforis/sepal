import {vi} from 'vitest'

import {addHash, getHash} from '~/hash'

vi.mock('~/store', () => ({
    select: vi.fn(() => undefined),
    subscribe: vi.fn()
}))

const {initializeRecipe} = await import('./recipe')

it('stamps a hash on a loaded recipe model that has none', () => {
    const result = initializeRecipe({id: 'r1', type: 'MOSAIC', model: {dates: {targetDate: '2024-06-01'}}})

    expect(getHash(result.model)).toEqual(expect.any(String))
})

it('preserves an existing model hash', () => {
    const model = {dates: {targetDate: '2024-06-01'}}
    addHash(model, 'existing-hash')

    const result = initializeRecipe({id: 'r1', type: 'MOSAIC', model})

    expect(getHash(result.model)).toBe('existing-hash')
})
