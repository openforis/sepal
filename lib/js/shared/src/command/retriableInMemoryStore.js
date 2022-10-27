const {of} = require('rxjs')
const _ = require('lodash')

// For "proper" implementations, after a crash
// there should be a job that finds timed out, in-progress,
// commands in the store and resubmits them.

class RetriableInMemoryStore {
    constructor() {
        this.commands = {}
    }

    startedCommand$(command, commandKey) {
        const completedSteps = this.commands[commandKey]?.completedSteps || {}
        this.commands = {
            ...this.commands,
            [commandKey]: {
                command,
                completedSteps
            }
        }
        return of(true)
    }

    loadStep$(commandKey, stepKey) {
        const completedSteps = this.commands[commandKey]?.completedSteps
        const step = completedSteps && completedSteps[stepKey]
        return of(step)
    }

    completedStep$(commandKey, stepKey, value) {
        const {command, completedSteps} = this.commands[commandKey]
        this.commands = {
            ...this.commands,
            [commandKey]: {
                command,
                completedSteps: {...completedSteps, [stepKey]: {value}}
            }
        }
        return of(true)
    }

    completedCommand$(commandKey) {
        this.commands = _.omit(this.commands, [commandKey])
        return of(true)
    }
}

module.exports = {RetriableInMemoryStore}
