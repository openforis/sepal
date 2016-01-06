import './main-app.tag'
import dependencies from 'dependencies'



riot.mount('*')

const route = filter => dependencies.dispatcher.trigger('todo:filter', filter)
riot.route((ignore, filter) => route(filter))
riot.route.exec((ignore, filter) => route(filter))
