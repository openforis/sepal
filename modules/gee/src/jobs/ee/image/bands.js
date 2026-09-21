import {map, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {assetBandEvidence, typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'
import {bandsWithEncoding, encodingPropertyKeys} from '#sepal/recipe/output/bandEncoding'

const worker$ = ({
    requestArgs: {asset, recipe, includeDataTypes = false}
}) => {

    const assetImage$ = () => ImageFactory({type: 'ASSET', id: asset}).getImage$()

    const assetBands$ = () =>
        includeDataTypes
            ? assetImage$().pipe(
                switchMap(image => ee.getInfo$(
                    assetBandEvidence(image, {encodingProperties: encodingPropertyKeys()}),
                    'asset band evidence'
                )),
                map(({bands, encoding}) => bandsWithEncoding(bands, encoding))
            )
            : assetImage$().pipe(
                switchMap(image => ee.getInfo$(image.bandNames(), 'asset band names'))
            )

    const recipeBands$ = () => {
        const {getBands$, getImage$} = ImageFactory(recipe)
        return includeDataTypes
            ? getImage$().pipe(switchMap(image => ee.getInfo$(typedBands(image), 'image band evidence')))
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
