import {describe, expect, it, vi} from 'vitest'

// What the input panel does with an answer about the selected source. The panel still copies bands and
// presentation into the model - saved recipes depend on it - so the question is only which answers may be
// written there.

vi.mock('~/widget/layout', () => ({Layout: () => null}))

const {ImageForm} = await import('./imageForm')

const SAVED_BANDS = ['red', 'nir', 'ndvi']
const SAVED_VISUALIZATIONS = [{id: 'v-ndvi', bands: ['ndvi']}]

const form = ({dirty = false, selected = 'source-1', bands = SAVED_BANDS, visualizations = SAVED_VISUALIZATIONS} = {}) => {
    const written = {}
    const field = name => ({
        value: name === 'bands' ? bands : name === 'visualizations' ? visualizations : undefined,
        set: value => written[name] = value
    })
    const component = new ImageForm({
        form: {isDirty: () => dirty},
        input: {value: selected},
        inputs: {
            bands: field('bands'),
            metadata: field('metadata'),
            visualizations: field('visualizations')
        }
    })
    return {component, written}
}

describe('an answer about the source that is selected', () => {
    it('is written while the user is editing', () => {
        const {component, written} = form({dirty: true})

        component.onLoaded('source-1', ['red'], {some: 'metadata'}, [])

        expect(written).toEqual({bands: ['red'], metadata: {some: 'metadata'}, visualizations: []})
    })

    // Reopening a saved recipe reloads its source. An answer that matches what is stored is not an edit,
    // and writing it would present an untouched panel as changed.
    it('is not written when it matches what the panel already holds', () => {
        const {component, written} = form()

        component.onLoaded('source-1', [...SAVED_BANDS], undefined, [...SAVED_VISUALIZATIONS])

        expect(written).toEqual({})
    })

    // The asset picker identifies what it parses on every read, so an untouched asset comes back with new
    // ids. Applying those would rewrite the model with identities no saved selection names.
    it('is not written when only its generated identities differ', () => {
        const {component, written} = form()

        component.onLoaded('source-1', SAVED_BANDS, undefined,
            SAVED_VISUALIZATIONS.map(visParams => ({...visParams, id: 'freshly-generated'})))

        expect(written).toEqual({})
    })

    it('keeps the identities the recipe knows when the source has genuinely restyled', () => {
        const {component, written} = form()

        component.onLoaded('source-1', SAVED_BANDS, undefined,
            [{id: 'freshly-generated', bands: ['ndvi'], palette: ['#111']}])

        expect(written.visualizations).toEqual([{id: 'v-ndvi', bands: ['ndvi'], palette: ['#111']}])
    })

    it('is written when the source has changed under a saved recipe', () => {
        const {component, written} = form()

        component.onLoaded('source-1', ['red', 'nir'], undefined, SAVED_VISUALIZATIONS)

        expect(written.bands).toEqual(['red', 'nir'])
    })

    it('is written when only its presentation has changed', () => {
        const {component, written} = form()

        component.onLoaded('source-1', SAVED_BANDS, undefined, [])

        expect(written.visualizations).toEqual([])
    })
})

// Two requests can be in flight when a user changes the selection, and the answers need not arrive in the
// order they were asked. The late one describes a source the panel no longer names.
describe('an answer about a source that is no longer selected', () => {
    it('is not written, even while editing', () => {
        const {component, written} = form({dirty: true, selected: 'source-2'})

        component.onLoaded('source-1', ['stale'], undefined, [])

        expect(written).toEqual({})
    })

    it('is not written when it has no source at all', () => {
        const {component, written} = form({dirty: true})

        component.onLoaded(undefined, ['stale'], undefined, [])

        expect(written).toEqual({})
    })
})
