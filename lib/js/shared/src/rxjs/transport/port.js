const {Transport} = require('../transport')

const PortTransport = ({transportId, port, onChannel}) => {
    const transport = Transport({transportId, messageOut: message => port.postMessage(message), onChannel})
    port.on('message', message => {
        transport.messageIn(message)
    })
    return transport
}

module.exports = {
    PortTransport
}
