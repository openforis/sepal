import {describe, expect, it, vi} from 'vitest'

import {activationAllowed as allowed, shouldDeactivate} from '~/widget/activation/activationPolicy'

// What may open beside the input imagery list Classification, Regression and Unsupervised Classification share, by the
// policy its panel applies and the activation rules every section follows: the editor of one of its images opens beside
// it; another section opens over a list with nothing to apply, which closes; a set-up wizard keeps every other section
// closed, and an image being edited keeps another section from opening over it.

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/user', () => ({}))
vi.mock('~/apiRegistry', () => ({default: {}}))

const {recipeFormPanelPolicy} = await import('~/app/home/body/process/recipeFormPanel')
const {additionalPolicy} = await import('./inputImagery')
const {inputImagePolicy} = await import('./inputImage')

describe('the input imagery list', () => {
    it('lets another section open over it with nothing to apply, and is closed by it', () => {
        const activatables = {
            inputImagery: {id: 'inputImagery', active: true, policy: listPolicy(CLEAN)},
            legend: {id: 'legend', policy: sectionPolicy(CLEAN)}
        }

        expect(allowed('legend', activatables)).toBe(true)
        expect(shouldDeactivate('legend', activatables, sectionPolicy(CLEAN))).toBe(true)
    })

    it('opens the editor of one of its images beside it, staying open', () => {
        const activatables = {
            inputImagery: {id: 'inputImagery', active: true, policy: listPolicy(CLEAN)},
            inputImage: {id: 'inputImage', policy: inputImagePolicy(CLEAN)}
        }

        expect(allowed('inputImage', activatables)).toBe(true)
        expect(shouldDeactivate('inputImage', activatables, inputImagePolicy(CLEAN))).toBe(false)
    })

    it('keeps another section from opening over an image\'s open editor, with its edits unapplied', () => {
        const activatables = {
            inputImagery: {id: 'inputImagery', active: true, policy: listPolicy(CLEAN)},
            inputImage: {id: 'inputImage', active: true, policy: inputImagePolicy(EDITED)},
            legend: {id: 'legend', policy: sectionPolicy(CLEAN)}
        }

        expect(allowed('legend', activatables)).toBe(false)
    })

    it('keeps another section closed in a set-up wizard, while still opening an image\'s editor', () => {
        const activatables = {
            inputImagery: {id: 'inputImagery', active: true, policy: listPolicy(IN_WIZARD)},
            inputImage: {id: 'inputImage', policy: inputImagePolicy(IN_WIZARD)},
            legend: {id: 'legend', policy: sectionPolicy(IN_WIZARD)}
        }

        expect(allowed('legend', activatables)).toBe(false)
        expect(allowed('inputImage', activatables)).toBe(true)
    })
})

const CLEAN = {values: {}, panelWizard: {wizard: false}}
const EDITED = {values: {dirty: true}, panelWizard: {wizard: false}}
const IN_WIZARD = {values: {}, panelWizard: {wizard: true}}

// As the list's panel applies it, and as any other section's does.
const listPolicy = props => recipeFormPanelPolicy({additionalPolicy})(props)
const sectionPolicy = props => recipeFormPanelPolicy()(props)
