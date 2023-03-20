const {job} = require('#gee/jobs/job')

const worker$ = ({asset, recipe}) => {
    const {throwError, of, catchError, map, switchMap} = require('rxjs')
    const {ClientException, NotFoundException} = require('#sepal/exception')
    const {EEException} = require('#sepal/ee/exception')
    const ImageFactory = require('#sepal/ee/imageFactory')
    const ee = require('#sepal/ee')

    const handleError$ = error =>
        ee.getAsset$(asset, 0).pipe(
            catchError(() => of(null)),
            switchMap(asset =>
                throwError(
                    () => asset
                        ? asset.type === 'Image'
                            ? new EEException('Failed to load asset.', {
                                cause: error,
                                userMessage: {
                                    message: 'Failed to load asset',
                                    key: 'gee.error.earthEngineException',
                                    args: {earthEngineMessage: error}
                                }
                            })
                            : new ClientException('Asset is not an image', {
                                cause: error,
                                userMessage: {
                                    message: 'Not an image',
                                    key: 'gee.image.error.notAnImage',
                                    args: {asset}
                                }
                            })
                        : new NotFoundException('Asset not found.', {
                            cause: error,
                            userMessage: {
                                message: 'Asset not found',
                                key: 'gee.asset.error.notFound',
                                args: {asset}
                            }
                        })
                )
            )
        )

    const image$ = ImageFactory(asset
        ? {type: 'ASSET', id: asset}
        : recipe
    ).getImage$()
    return image$.pipe(
        switchMap(image => ee.getInfo$(image, 'get image metadata')),
        map(({bands, properties}) => {
            const dataTypes = {}
            bands.forEach(({id, data_type: {precision, min, max}}) => dataTypes[id] = {precision, min, max})
            return {
                bands: bands.map(({id}) => id),
                dataTypes,
                properties
            }
        }),
        catchError(handleError$)
    )

}

module.exports = job({
    jobName: 'EE image metadata',
    jobPath: __filename,
    worker$
})
