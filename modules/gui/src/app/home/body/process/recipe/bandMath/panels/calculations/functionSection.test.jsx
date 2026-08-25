import {describe, expect, it, vi} from 'vitest'

vi.mock('../../../../recipeContext', () => ({
    withRecipe: () => Component => Component
}))
vi.mock('~/translate', () => ({msg: id => id}))
vi.mock('~/widget/form', () => ({Form: {FieldSet: 'field-set'}}))

import {FunctionSection} from './functionSection'

const createBands = () => {
    const red = {id: 'red-id', name: 'red', imageId: 'image-1', imageName: 'Image one'}
    const nir = {id: 'nir-id', name: 'nir', imageId: 'image-1', imageName: 'Image one'}
    const all = {id: 'all-id', name: 'all', imageId: 'image-1', imageName: 'Image one'}
    const blue = {id: 'blue-id', name: 'blue', imageId: 'image-2', imageName: 'Image two'}
    return {red, nir, all, blue}
}

const createSection = selectedBandNames => {
    const {red, nir, all, blue} = createBands()
    const bandsByName = {red, nir, all, blue}
    const usedBands = {
        value: selectedBandNames.map(name => bandsByName[name]),
        set: vi.fn()
    }
    const section = new FunctionSection({inputs: {usedBands}})
    section.state = {
        bandOptions: [
            {
                key: 'image-1',
                label: 'Image one',
                options: [
                    {value: 'image-1|red-id', label: 'red', band: red},
                    {value: 'image-1|nir-id', label: 'nir', band: nir},
                    {value: 'image-1|all-id', label: 'all', band: all}
                ]
            },
            {
                key: 'image-2',
                label: 'Image two',
                options: [{value: 'image-2|blue-id', label: 'blue', band: blue}]
            }
        ]
    }
    return {section, usedBands, red, nir, all, blue}
}

const getGroups = section => section.renderBands().props.children.props.children

describe('Band Math FunctionSection band groups', () => {
    it('renders each group as an expanded collection with add and remove-all controls', () => {
        const {section} = createSection([])

        const [group] = getGroups(section)
        const header = group.props.children
        const emptyState = group.props.expansion.props.children

        expect(group.props.expanded).toBe(true)
        expect(header.props.title).toBe('Image one')
        expect(header.props.inlineComponents.props.icon).toBe('plus')
        expect(header.props.removeConfirmationLabel).toBe('button.removeAll')
        expect(header.props.removeDisabled).toBe(true)
        expect(emptyState.props.message).toBe('process.panels.inputImagery.form.noBands')
    })

    it('adds one band named all without changing selections in other groups', () => {
        const {section, usedBands, all, blue} = createSection(['blue'])
        const [group] = getGroups(section)
        const combo = group.props.children.props.inlineComponents.props.children(vi.fn())
        const allBandOption = combo.props.options.find(({label}) => label === 'all')

        combo.props.onChange(allBandOption)

        expect(usedBands.set).toHaveBeenCalledWith([all, blue])
    })

    it('adds all remaining bands in a group and disables add when the group is complete', () => {
        const {section, usedBands, red, nir, all, blue} = createSection(['red', 'blue'])
        const [group] = getGroups(section)
        const combo = group.props.children.props.inlineComponents.props.children(vi.fn())
        const addAllOption = combo.props.options.find(
            ({label}) => label === 'process.classification.panel.inputImagery.bandSetSpec.addBands.all.label'
        )

        combo.props.onChange(addAllOption)

        expect(usedBands.set).toHaveBeenCalledWith([red, nir, all, blue])

        usedBands.value = [red, nir, all, blue]
        const [completeGroup] = getGroups(section)
        expect(completeGroup.props.children.props.inlineComponents.props.disabled).toBe(true)
    })

    it('removes one band or all bands from a group without changing other groups', () => {
        const {section, usedBands, nir, blue} = createSection(['red', 'nir', 'blue'])
        const [group] = getGroups(section)
        const selectedBands = group.props.expansion.props.children
        const redButton = selectedBands.find(({props}) => props.label === 'red')

        redButton.props.onClick()
        expect(usedBands.set).toHaveBeenCalledWith([nir, blue])

        group.props.children.props.onRemove()
        expect(usedBands.set).toHaveBeenLastCalledWith([blue])
    })
})
