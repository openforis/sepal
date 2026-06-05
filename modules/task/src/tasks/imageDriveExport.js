import {forkJoin, switchMap} from 'rxjs'
import {exportImageToDrive$} from '../jobs/export/toDrive.js'
import ImageFactory from '#sepal/ee/imageFactory'
import {getCurrentContext$} from '#task/jobs/service/context'
import {setWorkloadTag} from './workloadTag.js'

export const submit$ = (taskId, {image: {recipe, bands, driveFolder: folder, ...retrieveOptions}}) => {
        setWorkloadTag(recipe)
        return getCurrentContext$().pipe(
            switchMap(() => {
                const description = recipe.title || recipe.placeholder
                return export$(taskId, {description, recipe, bands, folder, ...retrieveOptions})
            })
        )
    }

const export$ = (taskId, {description, recipe, bands, scale, folder, ...retrieveOptions}) => {
    const factory = ImageFactory(recipe, bands)
    return forkJoin({
        image: factory.getImage$(),
        geometry: factory.getGeometry$()
    }).pipe(
        switchMap(({image, geometry}) =>
            exportImageToDrive$(taskId, {
                image,
                folder,
                ...retrieveOptions,
                description,
                region: geometry.bounds(scale),
                scale
            })
        )
    )
}
