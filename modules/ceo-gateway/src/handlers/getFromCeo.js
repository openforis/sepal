import {ceoUrl} from '../config.js'
import urljoin from 'url-join'
import {map, of, throwError, switchMap} from 'rxjs'
import {get$} from '#sepal/httpClient'
import {ClientException} from '#sepal/exception'

const getFromCeo$ = (ctx, {path, query}) => {
    const token = ctx.request.headers['x-ceo-token']
    return validateToken$(token).pipe(
        switchMap(() =>
            get$(urljoin(ceoUrl, path), {
                headers: {Cookie: token},
                query
            })
        ),
        map(({body}) => body)
    )
}

const validateToken$ = token =>
    get$(urljoin(ceoUrl, 'account'), {
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
