import {AsyncGunzip, AsyncGzip, DecodeUTF8, EncodeUTF8} from 'fflate'
import {from, map, Subject, toArray} from 'rxjs'

export const gzip$ = content => {
    const data$ = new Subject()
    const deflate = new AsyncGzip()
    deflate.ondata = (error, data, final) => {
        data$.next(data)
        if (error) {
            data$.error(error)
        }
        if (final) {
            data$.complete()
        }
    }
    const encode = new EncodeUTF8(
        (data, last) => deflate.push(data, last)
    )
    const toEncode = typeof content === 'string'
        ? content
        : JSON.stringify(content)
    encode.push(toEncode, true)

    const mergeData = dataArray => {
        const totalLength = dataArray
            .reduce(
                (acc, data) => data.length + acc,
                0
            )
        const mergedArray = new Uint8Array(totalLength)
        dataArray
            .reduce(
                (offset, data) => {
                    mergedArray.set(data, offset)
                    return data.length + offset
                },
                0
            )
        return mergedArray
    }
    return data$.pipe(
        toArray(),
        map(mergeData)
    )
}

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
