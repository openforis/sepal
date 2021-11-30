import {AsyncGunzip, AsyncGzip, DecodeUTF8, EncodeUTF8} from 'fflate'
import {from} from 'rxjs'

export const gzip$ = content =>
    from(new Promise((resolve, reject) => {
        const deflate = new AsyncGzip()
        deflate.ondata = (error, data) =>
            error
                ? reject(error)
                : resolve(data)
        const encode = new EncodeUTF8(
            data => deflate.push(data, true)
        )
        encode.push(
            typeof content === 'string'
                ? content
                : JSON.stringify(content),
            true
        )
    }))

export const ungzip$ = compressed =>
    from(new Promise((resolve, reject) => {
        const decode = new DecodeUTF8(
            data => resolve(data)
        )
        const inflate = new AsyncGunzip()
        inflate.ondata = (error, data) =>
            error
                ? reject(error)
                : decode.push(data, true)
        inflate.push(compressed, true)
    }))
