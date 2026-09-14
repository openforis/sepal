import {jest} from '@jest/globals'
import {firstValueFrom, of} from 'rxjs'

// Both geometry workers stage a FeatureCollection and hand it to style(). Those arguments are the
// server-rendered half of an aoi's appearance, so the outline width has to arrive alongside the colours.
const styleArgs = []

jest.unstable_mockModule('#sepal/ee/ee', () => ({
    default: {
        FeatureCollection: () => ({style: args => (styleArgs.push(args), 'styled')}),
        Feature: geometry => geometry,
        getMap$: () => of('map')
    }
}))
jest.unstable_mockModule('#sepal/ee/aoi', () => ({toGeometry$: () => of({})}))
jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({default: () => ({getGeometry$: () => of({})})}))
jest.unstable_mockModule('#gee/jobs/job', () => ({job: ({worker$}) => worker$}))

const {default: aoiGeometry$} = await import('#gee/jobs/ee/aoi/geometry')
const {default: recipeGeometry$} = await import('#gee/jobs/ee/image/geometry')

const styleOf = async (worker$, requestArgs) => {
    styleArgs.length = 0
    await firstValueFrom(worker$({requestArgs}))
    return styleArgs[0]
}

describe('geometry workers', () => {
    it('passes the requested outline width to the aoi style', async () => {
        expect(await styleOf(aoiGeometry$, {aoi: {}, color: '#FF0000', fillColor: '#FF000080', width: 5}))
            .toEqual({color: '#FF0000', fillColor: '#FF000080', width: 5})
    })

    it('passes the requested outline width to the recipe geometry style', async () => {
        expect(await styleOf(recipeGeometry$, {recipe: {}, color: '#FF0000', fillColor: '#FF000080', width: 5}))
            .toEqual({color: '#FF0000', fillColor: '#FF000080', width: 5})
    })

    it('keeps the previous appearance for a caller that sends no render arguments', async () => {
        expect(await styleOf(aoiGeometry$, {aoi: {}}))
            .toEqual({color: '#FFFFFF50', fillColor: '#FFFFFF08', width: 2})
    })
})
