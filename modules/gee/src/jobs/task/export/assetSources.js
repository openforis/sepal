import {defer} from 'rxjs'

import {ClientException} from '#sepal/exception'

import {ccdcAssetSource$} from './ccdcAssetExport.js'
import {imageAssetSource$} from './imageAssetExport.js'

const SOURCES = {image: imageAssetSource$, ccdc: ccdcAssetSource$}

export const assetSource$ = (kind, params) => defer(() => {
    if (!Object.hasOwn(SOURCES, kind)) {
        throw new ClientException(`Not an asset export kind: ${kind}`)
    }
    return SOURCES[kind](params)
})
