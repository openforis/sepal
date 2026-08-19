import {map, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'
import {formatDistance} from '#sepal/recipe/samplingDesign/samplingGrid'

const worker$ = ({
    requestArgs: {asset, recipe}
}) => {

    // Key names must match metadata.js (`crs`, `crs_transform`), or a consumer reading either endpoint breaks
    // silently. `nominalScale` is metres: a transform is in its CRS's units, which for EPSG:4326 are degrees.
    const bandGrids$ = image =>
        ee.getInfo$(image.bandNames(), 'image band names').pipe(
            switchMap(bandNames => ee.getInfo$(
                ee.Dictionary.fromLists(
                    bandNames,
                    bandNames.map(bandName => {
                        const projection = image.select([bandName]).projection()
                        return ee.Dictionary({
                            crs: projection.crs(),
                            crs_transform: projection.transform(),
                            nominalScale: projection.nominalScale()
                        })
                    })
                ),
                'image band grids'
            ).pipe(
                map(grids => bandNames.map(id => {
                    const grid = grids[id] || {}
                    return {
                        id,
                        crs: grid.crs,
                        crs_transform: grid.crs_transform,
                        nominalScale: Number.isFinite(Number(grid.nominalScale))
                            ? formatDistance(grid.nominalScale)
                            : undefined
                    }
                }))
            ))
        )

    // Read the grid from STORED data. Do NOT simplify this to ImageFactory: it mosaics a collection, and a mosaic
    // discards the members' grid, reporting the identity transform instead.
    const assetBands$ = () =>
        ee.getAsset$(asset, 0).pipe(
            switchMap(({type}) => bandGrids$(
                type === 'ImageCollection'
                    ? ee.ImageCollection(asset).first()
                    : ee.Image(asset)
            ))
        )

    const recipeBands$ = () => {
        const {getBands$, getImage$} = ImageFactory(recipe)
        return getBands$
            ? getBands$().pipe(map(bandNames => bandNames.map(id => ({id}))))
            : getImage$().pipe(switchMap(bandGrids$))
    }

    return asset
        ? assetBands$()
        : recipeBands$()
}

export default job({
    jobName: 'EE image bands',
    jobPath: fileName(import.meta.url),
    worker$
})
