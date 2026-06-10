import {switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {asset, recipe}
}) => {

    const assetBands$ = () =>
        ImageFactory({type: 'ASSET', id: asset}).getImage$().pipe(
            switchMap(image => ee.getInfo$(image.bandNames(), 'asset band names'))
        )

    const recipeBands$ = () => {
        const {getBands$, getImage$} = ImageFactory(recipe)
        return getBands$
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
