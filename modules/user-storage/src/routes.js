const {getMostRecentEvents, getUserEvents} = require('./database')

const mostRecentEvents = async ctx =>
    ctx.body = await getMostRecentEvents()

const userEvents = async ctx => {
    const {query: {username}} = ctx
    ctx.body = await getUserEvents(username)
}

const routes = router => router
    .get('/mostRecentEvents', async ctx => await mostRecentEvents(ctx))
    .get('/userEvents', async ctx => await userEvents(ctx))

module.exports = {routes}
