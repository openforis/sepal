import _ from 'lodash'

// What a form's inputs are told beyond their own constraints, where their validity depends on something the form does
// not hold - whether a selected source suits what it is for. `feedbackOf(name)` → {error, warning, busy, buttons} for
// the input of that name:
//
//   error    shown after the input's own error, with it rather than instead of it
//   warning  shown beside it, holding nothing back
//   busy     the input's busy indicator, explained by its label's tooltip
//   buttons  shown with the input's label
//
// `blocked()` says whether the form is held back, read at the moment of asking: an error or an unanswered check holds
// it back as an invalid field does.
export const withInputFeedback = (form, {feedbackOf, blocked}) => ({
    ...form,
    isInvalid: () => form.isInvalid() || blocked(),
    getErrorMessage: input => errors([form.getErrorMessage(input), ...namesOf(input).map(name => feedbackOf(name)?.error)]),
    feedbackOf: input => feedbackOf(nameOf(input)) || NO_FEEDBACK
})

// The feedback a form widget shows for its input, from the form it is in.
export const inputFeedback = (form, input) => form?.feedbackOf?.(input) || NO_FEEDBACK

// A widget's own tooltip, followed by what its feedback says it waits for: the check behind its busy indicator, said
// where its label already offers a tooltip, so starting a check leaves what the label holds as it is.
export const withBusyExplanation = (tooltip, {busy}) => {
    if (!_.isString(busy) || _.isFunction(tooltip)) {
        return tooltip
    }
    return tooltip ? [tooltip, busy].flat() : busy
}

// Label buttons a widget was given, followed by those its feedback adds.
export const withFeedbackButtons = (labelButtons, {buttons = []}) => {
    const all = [...[labelButtons].flat().filter(Boolean), ...buttons]
    return all.length ? all : undefined
}

const NO_FEEDBACK = Object.freeze({})

// One error as it is, several as the lines of one.
const errors = messages => {
    const lines = messages.flat().filter(Boolean)
    return lines.length > 1 ? lines : lines[0] || ''
}

const nameOf = input => typeof input === 'string' ? input : input?.name

const namesOf = input => [input].flat().map(nameOf).filter(Boolean)
