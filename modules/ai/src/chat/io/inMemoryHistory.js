const {defer, of} = require('rxjs')

function createInMemoryHistory() {
    const messages = []

    return {append$, load$}

    function append$(message) {
        return defer(() => {
            messages.push(message)
            return of(undefined)
        })
    }

    function load$() {
        return defer(() => of([...messages]))
    }
}

module.exports = {createInMemoryHistory}
