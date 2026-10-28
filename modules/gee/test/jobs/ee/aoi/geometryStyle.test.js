import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {firstValueFrom, of} from 'rxjs'

// Both geometry workers stage a FeatureCollection and hand it to style(). Those arguments are the
// server-rendered half of an aoi's appearance, so the outline width has to arrive alongside the colours.
const styleArgs = []

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            FeatureCollection: () => ({style: args => (styleArgs.push(args), 'styled')}),
            Feature: geometry => geometry,
            getMap$: () => of('map')
        }
    }
})
mock.module('#sepal/ee/aoi', {
    exports: {
        toGeometry$: () => of({})
    }
})
mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: () => ({getGeometry$: () => of({})})
    }
})
mock.module('#gee/jobs/job', {
    exports: {
        job: ({worker$}) => worker$
    }
})

const {default: aoiGeometry$} = await import('#gee/jobs/ee/aoi/geometry')
const {default: recipeGeometry$} = await import('#gee/jobs/ee/image/geometry')

const styleOf = async (worker$, requestArgs) => {
    styleArgs.length = 0
    await firstValueFrom(worker$({requestArgs}))
    return styleArgs[0]
}

describe('geometry workers', () => {
    it('passes the requested outline width to the aoi style', async () => {
        assert.deepEqual(
            await styleOf(aoiGeometry$, {aoi: {}, color: '#FF0000', fillColor: '#FF000080', width: 5}),
            {color: '#FF0000', fillColor: '#FF000080', width: 5}
        )
    })

    it('passes the requested outline width to the recipe geometry style', async () => {
        assert.deepEqual(
            await styleOf(recipeGeometry$, {recipe: {}, color: '#FF0000', fillColor: '#FF000080', width: 5}),
            {color: '#FF0000', fillColor: '#FF000080', width: 5}
        )
    })

    it('keeps the previous appearance for a caller that sends no render arguments', async () => {
        assert.deepEqual(
            await styleOf(aoiGeometry$, {aoi: {}}),
            {color: '#FFFFFF50', fillColor: '#FFFFFF08', width: 2}
        )
    })
})
