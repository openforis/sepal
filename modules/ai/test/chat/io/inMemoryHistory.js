const {defer, of} = require('rxjs')

function createInMemoryHistory(initial = []) {
    const messages = [...initial]

    return {append$, load$, clear$}

    function append$(message) {
        return defer(() => {
            messages.push(message)
            return of(undefined)
        })
    }

    function load$() {
        return defer(() => of([...messages]))
    }

    function clear$() {
        return defer(() => {
            messages.splice(0, messages.length)
            return of(undefined)
        })
    }
}

module.exports = {createInMemoryHistory}
