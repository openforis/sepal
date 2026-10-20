import {forkJoin, switchMap} from 'rxjs'

import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'

import {resolveImageOutput$} from './imageOutput.js'
import {startImageToDriveExport$} from './toDrive.js'

// The image is built only for a recipe that can run (imageOutput.js). Establishing that may itself read Earth Engine.
export const startImageDriveExport$ = ({image: {recipe, bands, driveFolder: folder, scale, ...retrieveOptions}}, {sepalUser}) => {
    const description = recipe.title || recipe.placeholder
    return resolveImageOutput$(recipe).pipe(
        switchMap(() => {
            const factory = ImageFactory(recipe, withOutputBands(bands))
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
