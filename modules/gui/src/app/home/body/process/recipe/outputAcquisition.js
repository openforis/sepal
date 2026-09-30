import _ from 'lodash'
import {Subscriber} from 'rxjs'

import {SOURCE_IDENTITY_CHANGED, SOURCE_RUNTIME_UNAVAILABLE} from '../sourceRuntime/sourceRuntimeError'
import {compatibleBasis, DESCRIBE} from './recipeOutput'
import {TerminalOperation} from './terminalOperation'

// What a consumer with a lifetime of its own - a map layer - has acquired about its recipe's output, retained for as
// long as it is mounted and no longer than it is still about the same records under the same credentials.
//
// The read decides whether anything is needed and names it by key (recipeOutput.js). This starts the one runtime
// operation that key asks for, retains its terminal, and answers `heldFor(key)` while that terminal is current:
//
//   - A key it already holds or is acquiring starts nothing, so a render that changes no record - restyling a layer -
//     costs nothing here.
//   - A terminal is retained only if the records it read are still the ones the session holds. One that is not is
//     refused, and the same key is not tried again: the session catching up changes the key.
//   - Credentials are watched for as long as anything is held or in flight. A change drops what is held and starts
//     exactly one replacement, whichever of the two notifications arrives first: the operation's own
//     SOURCE_IDENTITY_CHANGED is never retained and starts nothing.
//   - The runtime's scope ending drops what is held and stops everything, for good.
//
// Every slot is claimed before the work it names is subscribed, so a notification delivered synchronously - or one
// that re-enters from the owner's change handler - finds the state it was started under.

export class OutputAcquisition {
    #sourceRuntime
    #currentGraph
    #onChange
    #operation = new TerminalOperation()
    #identity = null
    #epoch = null
    #closed = false
    #wanted = null
    #inFlight = null
    #held = null
    #refused = null

    constructor({sourceRuntime, currentGraph, onChange}) {
        this.#sourceRuntime = sourceRuntime
        this.#currentGraph = currentGraph
        this.#onChange = onChange
    }

    heldFor(key) {
        return this.#isCurrent(this.#held, key) ? this.#held.terminal : null
    }

    // `acquisition` is the read's {kind, key}, or null when the session answers on its own.
    update(acquisition, recipe) {
        if (this.#closed) {
            return
        }
        if (!acquisition) {
            this.#wanted = null
            return this.#release()
        }
        this.#wanted = {...acquisition, recipe}
        this.#watchIdentity()
        this.#acquire()
    }

    stop() {
        this.#wanted = null
        this.#release()
    }

    #acquire() {
        const wanted = this.#wanted
        if (this.#closed || !wanted || this.#epoch === null) {
            return
        }
        if ([this.#held, this.#inFlight, this.#refused].some(entry => this.#isCurrent(entry, wanted.key))) {
            return
        }
        const operation = {key: wanted.key, epoch: this.#epoch}
        this.#inFlight = operation
        const {kind, recipe} = wanted
        this.#operation.start(
            kind === DESCRIBE
                ? this.#sourceRuntime.resolveImageOutput$({recipe})
                : this.#sourceRuntime.completeDependencies$({recipe}),
            terminal => this.#settled(operation, terminal)
        )
    }

    #settled(operation, terminal) {
        if (this.#inFlight !== operation) {
            return
        }
        this.#inFlight = null
        const code = terminal.error?.code
        if (code === SOURCE_IDENTITY_CHANGED) {
            return
        }
        if (code === SOURCE_RUNTIME_UNAVAILABLE) {
            return this.#close()
        }
        if (compatibleBasis(terminal.basis, this.#currentGraph())) {
            this.#held = {...operation, terminal}
        } else {
            this.#refused = operation
        }
        this.#onChange()
    }

    #watchIdentity() {
        if (this.#identity) {
            return
        }
        const identity = new Subscriber({
            next: epoch => this.#changedIdentity(epoch),
            error: () => this.#close(),
            complete: () => this.#close()
        })
        this.#identity = identity
        this.#sourceRuntime.identity$().subscribe(identity)
    }

    #changedIdentity(epoch) {
        const initial = this.#epoch === null
        this.#epoch = epoch
        if (initial) {
            return
        }
        this.#operation.stop()
        this.#inFlight = null
        this.#held = null
        this.#refused = null
        this.#acquire()
        this.#onChange()
    }

    #close() {
        if (this.#closed) {
            return
        }
        this.#closed = true
        this.#release()
        this.#onChange()
    }

    #release() {
        this.#operation.stop()
        this.#inFlight = null
        this.#held = null
        this.#refused = null
        this.#epoch = null
        const identity = this.#identity
        this.#identity = null
        identity?.unsubscribe()
    }

    #isCurrent(entry, key) {
        return entry !== null && entry.epoch === this.#epoch && _.isEqual(entry.key, key)
    }
}
