import {forkJoin, switchMap} from 'rxjs'

import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'

import {resolveRequestedImageOutput$} from './imageOutput.js'
import {startImageToDriveExport$} from './toDrive.js'

// The image is built only for a recipe that can run as it is asked to (resolveRequestedImageOutput$, imageOutput.js).
// Establishing that may itself read Earth Engine. Whether a file can hold the bands - a CCDC's are arrays - is not
// judged there.
export const startImageDriveExport$ = ({image: {recipe, bands, driveFolder: folder, scale, ...retrieveOptions}}, {sepalUser}) => {
    const description = recipe.title || recipe.placeholder
    const request = withOutputBands(bands)
    return resolveRequestedImageOutput$(recipe, request).pipe(
        switchMap(() => {
            const factory = ImageFactory(recipe, request)
            return forkJoin({
                image: factory.getImage$(),
                geometry: factory.getGeometry$()
            })
        }),
        switchMap(({image, geometry}) =>
            startImageToDriveExport$({
                ...retrieveOptions,
                image,
                folder,
                description,
                region: geometry.bounds(scale),
                scale
            }, {sepalUser})
        )
    )
}
