import _ from 'lodash'

import {classTransitions} from '#sepal/recipe/type/classChange'
import {defaultColor} from '~/widget/form/colorInput'

// What Class Change keeps derived in the applied recipe (derivedResult.js): its transition legend, labelling the
// transition band's codes, which execution computes from the two images' legends alone (classTransitions). Every commit
// derives it in its own action, whichever editor commits, from configuration alone: each image's classes, their values
// and labels in entry order. Nothing else of an image changes a transition.

export const CLASS_CHANGE_TRANSITIONS_DERIVATION = 'classChange.transitions'

export const classChangeDerivations = [
    {id: CLASS_CHANGE_TRANSITIONS_DERIVATION, applied: {followRecipe: followedTransitions}}
]

// The transition legend a commit leaves, from the model before it and the model as it leaves it. Kept as saved while
// either image has no classes, and where the commit changes no class's value, label or position while a legend is
// saved. Otherwise each transition is coded as execution codes it and known by its two classes' values: where the saved
// codes are those the classes before the commit give, and neither value repeats in its image's legend, a transition keeps
// its saved entry's id, and its label and colour unless they were their defaults, which are derived again. Any other
// transition takes the defaults.
export const committedTransitions = (previous, model) => {
    const saved = model.legend?.entries
    if (!hasClasses(model.fromImage) || !hasClasses(model.toImage)
        || (saved?.length && _.isEqual(classesOf(previous), classesOf(model)))) {
        return saved
    }
    const identified = identifiedTransitions(previous, model)
    return classTransitions(model.fromImage.legendEntries, model.toImage.legendEntries)
        .map(transition => transitionEntry(transition, identified(transition)))
}

function followedTransitions(previous, recipe) {
    const entries = committedTransitions(previous.model, recipe.model)
    return _.isEqual(entries, recipe.model.legend?.entries) ? [] : [{path: 'model.legend.entries', value: entries}]
}

const hasClasses = image => !!image?.legendEntries?.length

const IMAGES = ['fromImage', 'toImage']

const classesOf = model => IMAGES.map(key => legendOf(model, key).map(({value, label}) => ({value, label})))

// Each transition before the commit, with its saved entry, found by its classes' values.
const identifiedTransitions = (previous, model) => {
    const before = classTransitions(legendOf(previous, 'fromImage'), legendOf(previous, 'toImage'))
    const entries = previous?.legend?.entries || []
    const coded = _.isEqual(_.sortBy(entries.map(({value}) => value)), before.map(({value}) => value))
    const distinct = (key, value) => [previous, model]
        .every(side => legendOf(side, key).filter(entry => entry.value === value).length === 1)
    return ({from, to}) => {
        const transition = coded && distinct('fromImage', from.value) && distinct('toImage', to.value)
            && before.find(candidate => candidate.from.value === from.value && candidate.to.value === to.value)
        return transition && {...transition, entry: entries.find(({value}) => value === transition.value)}
    }
}

const transitionEntry = ({value, from, to}, before) => before
    ? {
        id: before.entry.id,
        value,
        label: before.entry.label === defaultLabel(before) ? defaultLabel({from, to}) : before.entry.label,
        color: before.entry.color === defaultColor(before.value) ? defaultColor(value) : before.entry.color
    }
    : {id: `transition-${value}-${from.value}-${to.value}`, value, label: defaultLabel({from, to}), color: defaultColor(value)}

const defaultLabel = ({from, to}) => `${from.label} -> ${to.label}`

const legendOf = (model, key) => model?.[key]?.legendEntries || []
