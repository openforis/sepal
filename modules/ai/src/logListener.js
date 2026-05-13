function createLogListener({log}) {
    return {onEvent}

    function onEvent(event) {
        if (event.level && event.message) {
            log(event.level, event.message)
        }
    }
}

module.exports = {createLogListener}
