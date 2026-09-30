import {map, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {assetBandEvidence$, imageBandEvidence$} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {asset, recipe, includeDataTypes = false}
}) => {

    const assetBands$ = () =>
        includeDataTypes
            ? assetBandEvidence$(asset)
            : assetBandEvidence$(asset).pipe(map(bands => bands.map(({name}) => name)))

    const recipeBandNames$ = () => {
        const {getBands$, getImage$} = ImageFactory(recipe)
        return getBands$
            ? getBands$()
            : getImage$().pipe(
                switchMap(image => ee.getInfo$(image.bandNames(), 'image band names'))
            )
    }

    const recipeBands$ = () =>
        includeDataTypes
            ? imageBandEvidence$(recipe)
            : recipeBandNames$()

    return asset
        ? assetBands$()
        : recipeBands$()
}

export default job({
    jobName: 'EE image bands',
    jobPath: fileName(import.meta.url),
    worker$
})
