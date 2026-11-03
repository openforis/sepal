import {map, of, switchMap, throwError} from 'rxjs'

import {ClientException} from '#sepal/exception'
import {get$} from '#sepal/httpClient'

import {ceoUrl} from '../config.js'

const getFromCeo$ = (ctx, {path, query}) => {
    const token = ctx.request.headers['x-ceo-token']
    return validateToken$(token).pipe(
        switchMap(() =>
            get$(new URL(path, ceoUrl), {
                headers: {Cookie: token},
                query
            })
        ),
        map(({body}) => body)
    )
}

const validateToken$ = token =>
    get$(new URL('account', ceoUrl), {
        redirect: 'manual',
        headers: {Cookie: token}
    }).pipe(
        switchMap(({statusCode}) => {
            if (statusCode === 302) {
                return throwError(() => new ClientException('CEO token has expired', {
                    userMessage: {
                        message: 'CEO token has expired',
                        key: 'process.classification.panel.trainingData.form.ceo.token.timedOut'
                    },
                    statusCode: 403
                }))
            } else {
                return of(null)
            }
        })
    )

export {getFromCeo$}
