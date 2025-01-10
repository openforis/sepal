const {ceoUrl} = require('../config')
const urljoin = require('url-join')
const {map, of, throwError, switchMap} = require('rxjs')
const {get$} = require('#sepal/httpClient')
const {ClientException} = require('#sepal/exception')

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
        followRedirect: false,
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

module.exports = {getFromCeo$}
