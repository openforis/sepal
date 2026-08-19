import {map, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'
import {formatDistance} from '#sepal/recipe/samplingDesign/samplingGrid'

const worker$ = ({
    requestArgs: {asset, recipe}
}) => {

    // Per-band grid, in metadata.js's key names (`crs`, `crs_transform`) so a consumer reads either endpoint's
    // shape without branching. `nominalScale` is the pixel size in METRES - computed, not present in the asset
    // description - because a transform is in its CRS's units and degrees are the common case for EPSG:4326.
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

    const assetBands$ = () =>
        ImageFactory({type: 'ASSET', id: asset}).getImage$().pipe(
            switchMap(bandGrids$)
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
