import {describe, expect, it, vi} from 'vitest'

import {isSupportedRecipeType} from '#sepal/recipe/recipeTypeRegistry'

import {listRecipeTypes} from './recipeTypeRegistry'
import {registerRecipeTypes} from './recipeTypes'

// `msg` reads a module-level `intl` that only a rendered IntlProvider assigns, and every recipe-type factory
// calls it while constructing its labels. Mocking that one function drops the requirement without touching
// production translation code; everything else here is real - the real factories run, the real GUI registry
// fills, and the real shared registry answers.
vi.mock('~/translate', async importOriginal => ({
    ...await importOriginal(),
    msg: key => key
}))

// The one place two production catalogues are compared. It reads both real registries rather than a copied
// list, because a literal list would go stale exactly when a recipe type is added - the case it exists to
// catch. Nothing is rendered and no element tree is inspected.
describe('every GUI recipe type has a shared source definition', () => {
    it('leaves no production recipe type unsupported', () => {
        registerRecipeTypes()
        const unsupported = listRecipeTypes()
            .map(({id}) => id)
            .filter(id => !isSupportedRecipeType(id))
        expect(unsupported, `unsupported by the shared registry: ${unsupported.join(', ')}`).toEqual([])
    })
})
