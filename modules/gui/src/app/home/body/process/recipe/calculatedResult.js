import _ from 'lodash'

import {STALE, UNKNOWN, UNVERSIONED} from '#sepal/recipe/calculation/freshness'
import {select, subscribe} from '~/store'

import {FAILED, OBSERVED, PENDING} from '../sourceRuntime/calculationEvidence'
import {SOURCE_BASIS_CHANGED} from '../sourceRuntime/sourceRuntimeError'
import {configurationGate} from './sourceRequirements'

// A result a form panel calculates and applies with the evidence of what it was calculated from, declared by the recipe's
// type (`calculatedResults`):
//
//   {id, panel, kind, dependency, candidate(recipe, model), question(model), answered(model), batch(model),
//    request$(question, {batch}), evidenceOf(answer), status(model, evidence), operation?, fits?(answer, recipe)}
//
// `panel` is the form panel editing it, `candidate` the recipe's model as the panel's values would leave it, `question`
// what the calculation is asked of that model, null while it cannot be asked, `answered` whether that model holds a
// result, and `batch` whether it is calculated as a batch task rather than online. `kind` and the question identify it
// to the source runtime, which shares it and answers only while what it read is current (calculationEvidence.js);
// `evidenceOf` is where an answer carries the evidence of `dependency`, the type's shared declaration, and `status` how
// the edited result stands against that dependency's current evidence: {state, acquisition, applicable}. A calculation
// over the applied recipe is held while the type's requirements hold `operation` (sourceRequirements.js), and an answer
// is taken only where it `fits` the applied recipe.
//
// While its panel is open the binding calculates what the edit requires, once it can be asked and the evidence of the
// dependency as the edit asks it is usable - read, current and from sources that report replacement: a result where the
// edit holds none, holds one answering another question - what the panel opened with answers the question it opened
// with - or one established STALE or saved without evidence (UNKNOWN). Evidence still being read, unreadable, expired or
// read from a source without a token starts nothing (`awaiting`), and neither does a result current or still being
// checked: elapsed time only has its evidence read again. Each question is asked once in each mode for each state of
// the edit, so what failed or was superseded is not asked again as its evidence is read again - only once the edit
// changes, the mode does or the panel asks again (`retry`). What the requirements hold waits for them to release it.
// The panel makes of an answer what it does (`onAnswer`), in its draft: Apply takes it with the rest of the edit,
// Cancel leaves the recipe as it was.
//
// The binding keeps the evidence of the dependency as the edit asks it current, so a draft already calculated stays
// applicable through a change that leaves what it read meaning the same; the edit's result is refused while it is not,
// while it answers another question, and while it is being calculated (recipeFormPanel.jsx). An answer is taken only
// while the edit still asks what it was asked: changing the question cancels what is running.
export class CalculatedResult {
    #sourceRuntime
    #recipeId
    #declaration
    #valuesToModel
    #onChange
    #onAnswer = null
    #model = null
    #question = null
    #answers = undefined
    #dependencyQuestion = null
    #evidence = null
    #running = null
    #failure = null
    #held = null
    #heldWatch = null
    #asked = null
    #settling = null
    #stopped = false

    constructor({sourceRuntime, recipeId, declaration, valuesToModel, onChange}) {
        this.#sourceRuntime = sourceRuntime
        this.#recipeId = recipeId
        this.#declaration = declaration
        this.#valuesToModel = valuesToModel
        this.#onChange = onChange
    }

    update(values) {
        const recipe = this.#recipe()
        const model = recipe ? this.#declaration.candidate(recipe, this.#valuesToModel(values)) : null
        if (_.isEqual(model, this.#model)) {
            return
        }
        this.#model = model
        // An edit, or an answer landing in it: what was asked of the edit before is the edit's to ask again.
        this.#asked = null
        const question = model ? this.#declaration.question(model) : null
        if (!_.isEqual(question, this.#question)) {
            this.#question = question
            this.#stopRunning()
            this.#failure = null
        }
        if (this.#answers === undefined) {
            this.#answers = this.answered() ? question : null
        }
        this.#watchDependency(model ? this.#declaration.dependency.question(model) : null)
        this.#settleSoon()
    }

    // What the panel makes of an answer, in its draft.
    onAnswer(handler) {
        this.#onAnswer = handler
    }

    // What the calculation is asked now, or null while it cannot be.
    question() {
        return this.#question
    }

    answered() {
        return Boolean(this.#model) && this.#declaration.answered(this.#model)
    }

    status() {
        return this.#model ? this.#declaration.status(this.#model, this.#dependencyEvidence()) : null
    }

    // Why what the edit requires is not being calculated: the evidence of its dependency, as the edit asks it, still to be
    // read (PENDING), unreadable (FAILED) or read from a source without a token (UNVERSIONED) - or null.
    awaiting() {
        return this.#question && !this.calculating() && this.#resultRequired() ? this.#unusable() : null
    }

    refused() {
        const status = this.status()
        return this.calculating() || (Boolean(status) && !status.applicable) || this.#answersAnother()
    }

    calculating() {
        return Boolean(this.#running)
    }

    // What the running calculation replaces: the state of the result it updates - STALE or UNKNOWN - or null.
    updating() {
        return this.#running?.updating || null
    }

    // Why the last calculation gave nothing to apply: {held} - the gate holding it - {superseded}, or {error}.
    failure() {
        return this.#held ? {held: this.#held} : this.#failure
    }

    // Asks what the edit asks, whether or not it was asked already.
    retry() {
        this.#stopRunning()
        this.#failure = null
        this.#question && this.#ask({question: this.#question, batch: this.#batch()})
        this.#onChange()
    }

    stop() {
        this.#stopped = true
        clearTimeout(this.#settling)
        this.#stopRunning()
        this.#watchHeld(false)
        this.#evidence?.unsubscribe()
        this.#evidence = null
    }

    // After what changed has settled: an edit lands over several renders, and evidence arrives for every watch at once.
    #settleSoon() {
        if (this.#settling === null && !this.#stopped) {
            this.#settling = setTimeout(() => {
                this.#settling = null
                this.#settle()
            }, 0)
        }
    }

    #settle() {
        if (this.#stopped) {
            return
        }
        if (!this.#required()) {
            if (this.#held) {
                this.#hold(null)
                this.#onChange()
            }
            return
        }
        const asking = {question: this.#question, batch: this.#batch()}
        if (_.isEqual(this.#running?.asking, asking) || _.isEqual(this.#asked, asking)) {
            return
        }
        this.#stopRunning()
        this.#ask(asking)
        this.#onChange()
    }

    #required() {
        return Boolean(this.#question && this.#sourceRuntime) && this.#resultRequired() && !this.#unusable()
    }

    #resultRequired() {
        if (!this.answered() || this.#answersAnother()) {
            return true
        }
        const state = this.status()?.state
        return state === STALE || state === UNKNOWN
    }

    // Calculating over what is not read yet, cannot be read or cannot report replacement would answer nothing the result
    // could be judged current by: an empty result reports no state of its own, so the evidence itself is judged.
    #unusable() {
        const {status, evidence} = this.#dependencyEvidence() || {}
        if (status === OBSERVED) {
            return evidence?.unversioned?.length ? UNVERSIONED : null
        }
        return status === FAILED ? FAILED : PENDING
    }

    #answersAnother() {
        return Boolean(this.#question) && this.answered() && !_.isEqual(this.#answers, this.#question)
    }

    #ask(asking) {
        const {operation} = this.#declaration
        const gate = operation ? configurationGate({recipe: this.#recipe(), operation}) : null
        this.#hold(gate)
        if (!gate) {
            this.#asked = asking
            this.#failure = null
            this.#run(asking)
        }
    }

    #run(asking) {
        const {kind, request$, evidenceOf, fits} = this.#declaration
        const state = this.answered() ? this.status()?.state : null
        const running = {asking, updating: state === STALE || state === UNKNOWN ? state : null}
        this.#running = running
        const settle = failure => {
            if (this.#running === running) {
                this.#running = null
                this.#failure = failure
                this.#onChange()
            }
        }
        const {question, batch} = asking
        running.subscription = this.#sourceRuntime.calculate$({kind, question, request$: () => request$(question, {batch}), evidenceOf}).subscribe({
            next: answer => {
                if (this.#running !== running) {
                    return
                }
                const taken = !fits || fits(answer, this.#recipe())
                if (taken) {
                    this.#answers = question
                    this.#onAnswer?.(answer)
                }
                settle(taken ? null : {superseded: true})
            },
            error: error => settle(error?.code === SOURCE_BASIS_CHANGED ? {superseded: true} : {error})
        })
    }

    #stopRunning() {
        this.#running?.subscription?.unsubscribe()
        this.#running = null
    }

    #hold(gate) {
        this.#held = gate
        this.#watchHeld(Boolean(gate))
    }

    // While the requirements hold the calculation, the evidence they judge the applied recipe by is watched for them to
    // release it: what the source runtime publishes on it.
    #watchHeld(held) {
        if (!held) {
            this.#heldWatch?.()
            this.#heldWatch = null
        } else if (!this.#heldWatch) {
            let published = this.#recipe()?.ui?.dependencyEvidence
            this.#heldWatch = subscribe(['process.loadedRecipes', this.#recipeId, 'ui', 'dependencyEvidence'], evidence => {
                if (evidence !== published) {
                    published = evidence
                    this.#settleSoon()
                }
            })
        }
    }

    #watchDependency(question) {
        if (_.isEqual(question, this.#dependencyQuestion)) {
            return
        }
        this.#evidence?.unsubscribe()
        this.#dependencyQuestion = question
        this.#evidence = question && this.#sourceRuntime
            ? this.#sourceRuntime.watchDependencyQuestion$({dependency: this.#declaration.dependency.id, question}).subscribe(() => {
                this.#settleSoon()
                this.#onChange()
            })
            : null
    }

    #dependencyEvidence() {
        return this.#sourceRuntime?.dependencyEvidence({dependency: this.#declaration.dependency.id, question: this.#dependencyQuestion})
    }

    #batch() {
        return Boolean(this.#model && this.#declaration.batch(this.#model))
    }

    #recipe() {
        return select(['process.loadedRecipes', this.#recipeId])
    }
}
