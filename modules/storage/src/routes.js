export const createRoutes = repository => {
    const mostRecentEvents = async ctx =>
        ctx.body = await repository.getMostRecentEvents()

    const userEvents = async ctx => {
        const {query: {username}} = ctx
        ctx.body = await repository.getUserEvents(username)
    }

    return router => router
        .get('/mostRecentEvents', async ctx => await mostRecentEvents(ctx))
        .get('/userEvents', async ctx => await userEvents(ctx))
}
