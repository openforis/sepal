import _ from 'lodash'

import {getLogger} from '#sepal/log'

const log = getLogger('progress')

// Progress is best-effort: the result file, not a callback, records how the task ended.
export class ProgressReporter {
    #send
    #last = null

    constructor({send}) {
        this.#send = send
    }

    report(statusDescription) {
        if (!_.isEqual(statusDescription, this.#last)) {
            this.#last = statusDescription
            this.#deliver()
        }
    }

    heartbeat() {
        if (this.#last) {
            this.#deliver()
        }
    }

    #deliver() {
        try {
            Promise.resolve(this.#send(this.#last))
                .catch(error => this.#warn(error))
        } catch (error) {
            this.#warn(error)
        }
    }

    #warn(error) {
        log.warn(`Progress not delivered: ${error.message}`)
    }
}
