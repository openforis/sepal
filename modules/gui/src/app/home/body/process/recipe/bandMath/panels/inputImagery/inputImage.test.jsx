import {describe, expect, it, vi} from 'vitest'

vi.mock('~/app/home/body/process/recipeFormPanel', () => ({
    RecipeFormPanel: ({children}) => children,
    recipeFormPanel: () => Component => Component
}))
vi.mock('./assetSection', () => ({AssetSection: () => null}))
vi.mock('./imageForm', () => ({ImageForm: () => null}))
vi.mock('./recipeSection', () => ({RecipeSection: () => null}))
vi.mock('./sectionSelection', () => ({SectionSelection: () => null}))
vi.mock('~/translate', () => ({msg: id => id}))
vi.mock('~/widget/form', () => {
    class Property {
        match() {
            return this
        }

        notBlank() {
            return this
        }

        notEmpty() {
            return this
        }

        predicate() {
            return this
        }

        skip() {
            return this
        }
    }

    return {Form: {Field: Property}}
})

import {InputImage} from './inputImage'

describe('Band Math InputImage band actions', () => {
    it('leaves band actions to the image form instead of the panel footer', () => {
        const inputImage = new InputImage({
            inputs: {
                bands: {value: {red: {}, nir: {}}},
                includedBands: {value: [], set: vi.fn()}
            }
        })

        const panelSections = inputImage.render().props.children

        expect(panelSections.props.defaultButtons).toBeUndefined()
    })
})
