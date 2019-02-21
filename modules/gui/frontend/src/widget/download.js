import {from} from 'rxjs'
import {map} from 'rxjs/operators'
import JSZip from 'jszip'

export const download = (url, filename) => {
    // create hidden anchor, attach to DOM, click it and remove it from the DOM
    var downloadElement = document.createElement('a')
    downloadElement.setAttribute('style', 'display: none')
    downloadElement.setAttribute('href', url)
    downloadElement.setAttribute('download', filename)
    document.body.appendChild(downloadElement)
    downloadElement.click()
    downloadElement.remove()
}

export const downloadObject = (object, filename) => {
    const data = window.URL.createObjectURL(object)
    download(data, filename)
    window.URL.revokeObjectURL(data)
}

export const downloadObjectZip$ = ({filename, data}) => {
    const zipPromise = new JSZip()
        .file(filename, data)
        .generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 5
            }
        })
    return from(zipPromise).pipe(
        map(zippedRecipe =>
            downloadObject(zippedRecipe, filename + '.zip')
        )
    )
}
