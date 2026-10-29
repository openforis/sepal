import {requireAdmin} from '#sepal/currentUser'

export const createRoutes = repository => {
    const mostRecentEvents = async ctx =>
        ctx.body = await repository.getMostRecentEvents()

    const userEvents = async ctx => {
        const {query: {username}} = ctx
        ctx.body = await repository.getUserEvents(username)
    }

    return router => router
        .get('/mostRecentEvents', requireAdmin, async ctx => await mostRecentEvents(ctx))
        .get('/userEvents', requireAdmin, async ctx => await userEvents(ctx))
}
