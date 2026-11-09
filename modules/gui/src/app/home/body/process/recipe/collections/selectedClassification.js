import _ from 'lodash'
import React from 'react'
import {Subject} from 'rxjs'

import {isClassifiedOutput} from '#sepal/recipe/classifiedOutputs'
import {CLASSIFICATION_SOURCE} from '#sepal/recipe/source/collectionSources'
import {sessionRecipeCache} from '~/app/home/body/process/recipe'
import {RecipeCacheClaimant} from '~/app/home/body/process/recipeCacheClaims'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'

import {bandPresentation, classifiedOutputFallbackLabel} from '../classification/bands'
import {selectedSourceOf} from '../sources/sourceEvidence'

// The legend and classifier of the Classification a recipe's Sources select - its type, and its configuration, which decides
// what it can output (supportProbability) - as what is offered of its outputs reads them: the record's own while the
// session holds it, so an edit to it is seen at once; otherwise as the operation the offer is for resolved it
// (`recordOf`, operationReadiness.js), while the runtime holds a current answer read from it. `classificationResolved`
// says whether either does: while neither does, nothing is offered of it. The selection is the one the recipe's type
// declares (CLASSIFICATION_SOURCE): with none, nothing is offered of it.
export const selectedClassificationOfState = (state, recipe, recordOf = () => null) => {
    const id = selectedClassificationId(recipe)
    if (!id) {
        return NONE_SELECTED
    }
    const record = selectFrom(state, ['process.loadedRecipes', id]) || recordOf(id)
    return record
        ? {
            classificationLegend: selectFrom(record, 'model.legend') || null,
            classifierType: selectFrom(record, 'model.classifier.type') || null,
            classifier: selectFrom(record, 'model.classifier') || null,
            classificationResolved: true
        }
        : UNRESOLVED
}

export const selectedClassificationId = recipe => selectedSourceOf(recipe, CLASSIFICATION_SOURCE)?.id || null

// Whose names a recipe's classified outputs are given: the recipe's, as it selects a Classification (classifiedOutputLabel).
export const classificationNaming = recipe => ({recipeId: recipe?.id || null, classificationId: selectedClassificationId(recipe)})

// What a classified output is called where a recipe's Sources select a Classification (`naming`), for presentation alone - it
// says nothing of whether that output is provided. It is resolved each time it is said, while the recipe's consumers hold
// a selection: as that Classification names it where the session holds its record; otherwise as they last showed that
// Classification naming it; otherwise as they last showed the output named, whichever Classification they showed it of -
// one applied while another is edited, or selected before - which a class removed since does not undo; otherwise by
// what it is (classifiedOutputFallbackLabel). Its choices and what is said of them name it alike.
export const classifiedOutputLabel = ({recipeId, classificationId} = {}, band) =>
    readers.get(recipeId)?.labelOf(classificationId, band) || classifiedOutputFallbackLabel(band)

// What a band a recipe's Sources may choose is called: a band of the images by its name, as Sources offer it, and a
// classified output as classifiedOutputLabel names it.
export const chosenBandLabel = (naming, band) => isClassifiedOutput(band) ? classifiedOutputLabel(naming, band) : band

// The recipe as Sources being edited would leave it: selecting the Classification their draft selects.
export const draftSelection = (recipe, {inputs}) =>
    ({...recipe, model: {...recipe.model, sources: {...recipe.model?.sources, classification: inputs.classification.value}}})

// Gives a recipe's component the Classification `candidate(recipe, props)` selects - by default the recipe as applied -
// holding it while mounted: `selectedClassification`, what selectedClassificationOfState says of it as the session
// holds it, with whether it is being read (`loading`) and what a band its Sources may choose is called (`labelOf`,
// chosenBandLabel). What it shows them called is remembered for the recipe, to name one nothing it holds names any longer.
// `loadError` is the message a failed read is notified with.
export const withSelectedClassification = ({candidate = recipe => recipe, loadError}) =>
    WrappedComponent => {
        const mapStateToProps = (state, props) => {
            const recipe = selectFrom(state, ['process.loadedRecipes', props.recipeId])
            const selected = recipe ? candidate(recipe, props) : null
            return {
                selectedClassificationId: selected ? selectedClassificationId(selected) : null,
                selectedClassificationOffer: selected ? selectedClassificationOfState(state, selected) : NONE_SELECTED
            }
        }
        return compose(
            class SelectedClassificationHOC extends React.Component {
                state = {status: null}

                render() {
                    const {selectedClassificationId: _id, selectedClassificationOffer: offer, ...props} = this.props
                    const {status} = this.state
                    return React.createElement(WrappedComponent, {
                        ...props,
                        selectedClassification: {
                            ...offer,
                            loading: !offer.classificationResolved && status === PENDING,
                            labelOf: band => chosenBandLabel(classificationNaming(this.candidate()), band)
                        }
                    })
                }

                candidate() {
                    const recipe = select(['process.loadedRecipes', this.props.recipeId])
                    return recipe ? candidate(recipe, this.props) : null
                }

                componentDidMount() {
                    this.claim = new SelectedClassificationClaim({
                        recipeId: this.props.recipeId,
                        loadError,
                        onChange: () => this.updateStatus()
                    })
                    this.hold()
                }

                componentDidUpdate() {
                    this.hold()
                }

                componentWillUnmount() {
                    this.claim.release()
                }

                // A read another consumer started says nothing to one joining it, which asks how it stands. What the
                // Classification it presents calls its outputs is remembered for the recipe.
                hold() {
                    const {selectedClassificationId: id, selectedClassificationOffer: {classificationLegend}} = this.props
                    this.claim.hold(id)
                    this.updateStatus()
                    if (id && classificationLegend && classificationLegend !== this.presentedLegend) {
                        this.presentedLegend = classificationLegend
                        this.claim.remember(id, legendLabels(classificationLegend))
                    }
                }

                updateStatus() {
                    const status = this.claim.status()
                    if (status !== this.state.status) {
                        this.setState({status})
                    }
                }
            },
            connect(mapStateToProps)
        )
    }

// A consumer's hold on its recipe's reader: one Classification at a time, the one `hold` last named.
class SelectedClassificationClaim {
    #recipeId
    #loadError
    #reader
    #holder = Symbol('holder')
    #id = null
    #subscription

    constructor({recipeId, loadError, onChange}) {
        this.#recipeId = recipeId
        this.#loadError = loadError
        this.#reader = readerOf(recipeId)
        this.#reader.claims++
        this.#subscription = this.#reader.changes$.subscribe(onChange)
    }

    // What it held before is let go only after what it holds now is held, so a read both name continues.
    hold(id) {
        if (id === this.#id) {
            return
        }
        const previous = this.#id
        this.#id = id || null
        this.#id && this.#reader.hold(this.#id, this.#holder, this.#loadError)
        previous && this.#reader.letGo(previous, this.#holder)
    }

    status() {
        return this.#id ? this.#reader.statusOf(this.#id) : null
    }

    remember(id, labels) {
        this.#reader.remember(id, labels)
    }

    release() {
        this.#subscription.unsubscribe()
        this.hold(null)
        if (--this.#reader.claims === 0) {
            readers.delete(this.#recipeId)
        }
    }
}

const PENDING = 'PENDING'
const FAILED = 'FAILED'

const NONE_SELECTED = {classificationLegend: null, classifierType: null, classifier: null, classificationResolved: true}

const UNRESOLVED = {classificationLegend: null, classifierType: null, classifier: null, classificationResolved: false}

const legendLabels = legend => _.mapValues(bandPresentation({model: {legend}}), ({label}) => label)

// A recipe's one reader of the Classifications its consumers hold - its root the applied selection, for as long as its tab
// is open, and Sources the one being edited - so that consumers holding the same one read it once between them. A read
// lands in the session's recipe cache, claimed while any consumer holds it, and is accepted as any claimant's is
// (recipeCacheClaims.js): an open draft, or a copy as new or newer, is kept. A read no consumer holds any longer is
// cancelled; one that failed is read again for a consumer that comes to hold it. The source runtime reads what its own
// work needs independently (sourceRuntime.js): work started before this read lands may read the record itself, and
// work started after takes it from the session. For as long as it reads for them, it remembers what its consumers last
// showed each Classification calling its outputs, and, by output, what they last showed each one called, which a class
// removed since does not undo.
class Reader {
    claims = 0
    #reads = new Map()
    #labelsOf = new Map()
    #shown = new Map()
    #changes = new Subject()
    changes$ = this.#changes.asObservable()

    remember(id, labels) {
        this.#labelsOf.set(id, labels)
        Object.entries(labels).forEach(([band, label]) => this.#shown.set(band, label))
    }

    // As the record the session holds names it now, so whatever says it follows a rename at once; otherwise as remembered.
    labelOf(id, band) {
        const legend = id && selectFrom(sessionRecipeCache.held(id), 'model.legend')
        return (legend && legendLabels(legend)[band]) || this.#labelsOf.get(id)?.[band] || this.#shown.get(band)
    }

    hold(id, holder, loadError) {
        const read = this.#reads.get(id)
        if (!read) {
            const started = {claimant: new RecipeCacheClaimant(sessionRecipeCache), holders: new Set([holder]), loadError}
            this.#reads.set(id, started)
            this.#load(id, started)
        } else if (!read.holders.has(holder)) {
            read.holders.add(holder)
            if (read.status === FAILED) {
                this.#load(id, read)
            }
        }
    }

    letGo(id, holder) {
        const read = this.#reads.get(id)
        if (read?.holders.delete(holder) && !read.holders.size) {
            this.#reads.delete(id)
            read.subscription?.unsubscribe()
            read.claimant.release()
        }
    }

    statusOf(id) {
        return this.#reads.get(id)?.status || null
    }

    #load(id, read) {
        read.status = PENDING
        this.#changes.next()
        read.subscription = read.claimant.load$(id).subscribe({
            error: error => {
                read.status = FAILED
                Notifications.error({message: msg(read.loadError, {error}), error})
                this.#changes.next()
            },
            complete: () => {
                read.status = null
                this.#changes.next()
            }
        })
    }
}

const readers = new Map()

const readerOf = recipeId => {
    if (!readers.has(recipeId)) {
        readers.set(recipeId, new Reader())
    }
    return readers.get(recipeId)
}
