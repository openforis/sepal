import {job} from '#gee/jobs/job'
import ImageFactory from '#sepal/ee/imageFactory'
import ee from '#sepal/ee/ee'
import {switchMap} from 'rxjs'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)

const worker$ = ({
    requestArgs: {asset, recipe}
}) => {

    if (asset) {
        return assetBands$()
    } else {
        return recipeBands$()
    }

    function assetBands$() {
        return ImageFactory({type: 'ASSET', id: asset}).getImage$().pipe(
            switchMap(image => ee.getInfo$(image.bandNames(), 'asset band names'))
        )
    }

    function recipeBands$() {
        const {getBands$, getImage$} = ImageFactory(recipe)
        return getBands$
            ? getBands$()
            : getImage$().pipe(
                switchMap(image => ee.getInfo$(image.bandNames(), 'image band names'))
            )
    }
}

export default job({
    jobName: 'EE image bands',
    jobPath: __filename,
    worker$
})
