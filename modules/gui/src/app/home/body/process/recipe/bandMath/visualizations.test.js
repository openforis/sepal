import {describe, expect, it} from 'vitest'

// Band Math renames the bands of its input images, and a style over an input band has to be re-expressed in
// the output's names to mean anything downstream. Derived from a Band Math recipe over one radar image
// producing a calculated `ratio` alongside the passed-through `VV` and `VH`.

const {getPreSetVisualizations} = await import('./visualizations')

const VV_VH = {id: 'v-vvvh', bands: ['VV', 'VH'], type: 'rgb'}
const RATIO_VV_VH = {id: 'v-ratio-vv-vh', bands: ['ratio_VV_VH'], type: 'continuous'}

const recipeOf = ({outputBands, visualizations = [VV_VH]}) => ({
    id: 'band-math-1',
    type: 'BAND_MATH',
    model: {
        inputImagery: {images: [{imageId: 'image-1', type: 'RECIPE_REF', id: 'radar-1', visualizations}]},
        outputBands: {outputImages: [{imageId: 'image-1', outputBands}]}
    }
})

const defaultNames = [
    {name: 'VV', defaultOutputName: 'VV'},
    {name: 'VH', defaultOutputName: 'VH'}
]

describe('a style over bands nobody has renamed', () => {
    it('is offered under the names the output actually carries', () => {
        const recipe = recipeOf({outputBands: defaultNames})

        expect(getPreSetVisualizations(recipe)).toEqual([{...VV_VH, bands: ['VV', 'VH']}])
    })

    it('keeps its identity, so a selection naming it still holds', () => {
        expect(getPreSetVisualizations(recipeOf({outputBands: defaultNames}))[0].id).toBe('v-vvvh')
    })
})

describe('a style over a band that has been renamed', () => {
    it('follows the rename', () => {
        const recipe = recipeOf({
            outputBands: [
                {name: 'VV', defaultOutputName: 'VV', outputName: 'vertical'},
                {name: 'VH', defaultOutputName: 'VH'}
            ]
        })

        expect(getPreSetVisualizations(recipe)[0].bands).toEqual(['vertical', 'VH'])
    })
})

// The calculated band and an input band the source never had are different bands. One is produced here; the
// other names nothing, and a style over it describes an image this recipe does not make.
describe('a style over a band the output does not have', () => {
    const withCalculatedRatio = visualizations => recipeOf({
        outputBands: [...defaultNames, {name: 'ratio', defaultOutputName: 'ratio'}],
        visualizations
    })

    it('is not offered', () => {
        expect(getPreSetVisualizations(withCalculatedRatio([RATIO_VV_VH]))).toEqual([])
    })

    it('is not answered with the calculated band that resembles it', () => {
        const offered = getPreSetVisualizations(withCalculatedRatio([RATIO_VV_VH, VV_VH]))

        expect(offered.flatMap(({bands}) => bands)).not.toContain('ratio')
        expect(offered.map(({id}) => id)).toEqual(['v-vvvh'])
    })

    it('does not suppress the styles beside it', () => {
        expect(getPreSetVisualizations(withCalculatedRatio([RATIO_VV_VH, VV_VH])).map(({id}) => id))
            .toEqual(['v-vvvh'])
    })
})

describe('an input image with nothing styled', () => {
    it('offers nothing rather than failing', () => {
        const unstyled = {
            id: 'band-math-1',
            type: 'BAND_MATH',
            model: {
                inputImagery: {images: [{imageId: 'image-1', type: 'RECIPE_REF', id: 'radar-1'}]},
                outputBands: {outputImages: [{imageId: 'image-1', outputBands: defaultNames}]}
            }
        }

        expect(getPreSetVisualizations(unstyled)).toEqual([])
    })
})
