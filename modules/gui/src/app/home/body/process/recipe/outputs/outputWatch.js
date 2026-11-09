import _ from 'lodash'

// A consumer's watch on the one output question it reads - its recipe and the product it shows - for as long as it is
// mounted. The runtime owns the loading and what is held (outputRegistry.js); this owns only which question the
// consumer is watching, and tells it when what the runtime holds for that question may have changed.
//
// A changed question is watched before the previous one is released, so work both name is never cancelled in between.

export class OutputWatch {
    #sourceRuntime
    #onChange
    #question = null
    #subscription = null

    constructor({sourceRuntime, onChange}) {
        this.#sourceRuntime = sourceRuntime
        this.#onChange = onChange
    }

    // `question` is {recipeId, product}, or null when the consumer reads no output.
    update(question) {
        if (_.isEqual(question, this.#question)) {
            return
        }
        const previous = this.#subscription
        this.#question = question
        this.#subscription = question
            ? this.#sourceRuntime.watchOutput$(question).subscribe({
                next: () => this.#onChange(),
                complete: () => this.#onChange()
            })
            : null
        previous?.unsubscribe()
    }

    stop() {
        this.update(null)
    }
}
