import {switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {asset, recipe, includeDataTypes = false}
}) => {

    const typedBands$ = image$ => image$.pipe(
        switchMap(image => {
            const bandTypes = image.bandTypes()
            const bands = image.bandNames().map(name => ee.Dictionary({
                name,
                arrayDimensions: ee.PixelType(bandTypes.get(name)).dimensions()
            }))
            return ee.getInfo$(bands, 'image band evidence')
        })
    )

    const assetBands$ = () =>
        includeDataTypes
            ? typedBands$(ImageFactory({type: 'ASSET', id: asset}).getImage$())
            : ImageFactory({type: 'ASSET', id: asset}).getImage$().pipe(
                switchMap(image => ee.getInfo$(image.bandNames(), 'asset band names'))
            )

    const recipeBands$ = () => {
        const {getBands$, getImage$} = ImageFactory(recipe)
        return includeDataTypes
            ? typedBands$(getImage$())
            : getBands$
                ? getBands$()
                : getImage$().pipe(
                    switchMap(image => ee.getInfo$(image.bandNames(), 'image band names'))
                )
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
