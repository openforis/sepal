const {stream} = require('#sepal/httpServer')
const {ClientException} = require('#sepal/exception')
const {getFromCeo$} = require('./handlers/getFromCeo')
const {loginToken$} = require('./handlers/loginToken')
const routes = router => router
    .post('/login-token', stream(ctx => loginToken$(ctx)))
    .get('/get-all-institutions', stream(ctx =>
        getFromCeo$(ctx, {
            path: 'get-all-institutions'
        })
    ))
    .get('/get-institution-by-id', stream(ctx =>
        getFromCeo$(ctx, {
            path: 'get-institution-by-id',
            query: {institutionId: requiredQueryParam(ctx, 'institutionId')}
        })
    ))
    .get('/get-institution-projects', stream(ctx =>
        getFromCeo$(ctx, {
            path: 'get-institution-projects',
            query: {institutionId: requiredQueryParam(ctx, 'institutionId')}
        })
    ))
    .get('/get-project-data', stream(ctx =>
        getFromCeo$(ctx, {
            path: requiredQueryParam(ctx, 'csvType') === 'plot'
                ? 'dump-project-aggregate-data'
                : 'dump-project-raw-data',
            query: {projectId: requiredQueryParam(ctx, 'projectId')}
        })
    ))

const requiredQueryParam = (ctx, name) => {
    const value = ctx.request.query[name]
    if (value === undefined) {
        const message = `Missing query parameter: ${name}`
        throw new ClientException(message, {
            userMessage: {message}
        })
    } else {
        return value
    }
}

module.exports = {routes}
