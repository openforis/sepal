const handle$ = ({serviceName, requestId, data}) =>
    require(`@sepal/service/${serviceName}`).handle$(requestId, data)

module.exports = {handle$}
