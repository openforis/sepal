import _ from 'lodash'

import {actionBuilder} from '~/action-builder'
import {selectFrom} from '~/stateUtils'
import {uuid} from '~/uuid'

// The visualization panel's draft, as one panel copies it and another pastes it: what is entered, as it is entered -
// blank, partly typed or invalid values included - by visualization type. Normalizing belongs to a successful Apply,
// not to a transfer. Nothing identifies where a draft came from: not its visualization, recipe, layer or product, nor
// its source's value format (`dataType`), which would tell the destination its values are dates.
//
// One draft is held at a time, in the session's state outside any recipe: shared by every panel of every recipe and
// map area, replaced by the next Copy, gone on reload, and never saved or written to the system clipboard. A draft holds
// values alone, never a panel's own objects, so what is copied and what is pasted change independently.
const CLIPBOARD = 'visualizationClipboard'

const CHANNELS = {continuous: 1, rgb: 3, hsv: 3}

export const copyVisualizationDraft = draft =>
    actionBuilder('COPY_VISUALIZATION_DRAFT')
        .set(CLIPBOARD, draft)
        .dispatch()

// The draft held, or null where none is - or what is held cannot be read as one.
export const copiedVisualizationDraft = state => {
    const draft = selectFrom(state, CLIPBOARD)
    return isDraft(draft) ? draft : null
}

// The draft of a panel's form values and legend rows, for its own visualization type.
export const draftOf = ({values, legendEntries}) => {
    const {type} = values
    if (type === 'categorical') {
        return {
            type,
            band: values.name1,
            legend: legendEntries.map(({value, label, color}) => ({value, label, color}))
        }
    }
    const channels = _.range(CHANNELS[type] || 0).map(i => ({
        band: values[`name${i + 1}`],
        min: values[`min${i + 1}`],
        max: values[`max${i + 1}`],
        inverted: inverted(values[`inverted${i + 1}`]),
        ...(type === 'continuous' ? {} : {gamma: values[`gamma${i + 1}`]})
    }))
    return type === 'continuous'
        ? {type, channels, palette: {colors: (values.palette || []).map(({color}) => color), text: values.paletteText?.text ?? null}}
        : {type, channels}
}

// The form values and legend rows a pasted draft replaces a panel's with. What its type does not use starts as in a
// panel adding a new visualization; rows and colors are given ids of their own.
export const draftValues = draft => {
    const values = {
        ...EMPTY_VALUES,
        type: draft.type,
        ...(draft.type === 'categorical'
            ? {name1: draft.band}
            : Object.assign({}, ...draft.channels.map(({band, min, max, inverted, gamma}, i) => ({
                [`name${i + 1}`]: band,
                [`min${i + 1}`]: min,
                [`max${i + 1}`]: max,
                [`inverted${i + 1}`]: inverted ? [true] : [],
                ...(gamma === undefined ? {} : {[`gamma${i + 1}`]: gamma})
            })))),
        ...(draft.palette
            ? {
                palette: draft.palette.colors.map(color => ({id: uuid(), color})),
                paletteText: draft.palette.text === null ? null : {text: draft.palette.text}
            }
            : {})
    }
    const legendEntries = (draft.legend || []).map(row => ({id: uuid(), ...row}))
    return {values, legendEntries}
}

const EMPTY_VALUES = {
    palette: '',
    paletteText: null,
    ...Object.assign({}, ..._.range(1, 4).map(i => ({
        [`name${i}`]: '',
        [`min${i}`]: '',
        [`max${i}`]: '',
        [`inverted${i}`]: '',
        [`gamma${i}`]: 1
    })))
}

const inverted = value => Array.isArray(value) ? value[0] === true : value === true

// Anything a panel's field or legend row could hold: what it is, valid or not, is the destination's to judge.
const isEntry = value => value === null || value === undefined || ['string', 'number', 'boolean'].includes(typeof value)

const isRecord = (value, keys) => _.isPlainObject(value) && keys.every(key => isEntry(value[key]))

const isDraft = draft => {
    if (!_.isPlainObject(draft)) {
        return false
    }
    if (draft.type === 'categorical') {
        return isEntry(draft.band)
            && Array.isArray(draft.legend)
            && draft.legend.every(row => isRecord(row, ['value', 'label', 'color']))
    }
    const channels = CHANNELS[draft.type]
    return Boolean(channels)
        && Array.isArray(draft.channels)
        && draft.channels.length === channels
        && draft.channels.every(channel => isRecord(channel, ['band', 'min', 'max', 'inverted', 'gamma']))
        && (draft.type !== 'continuous' || (
            _.isPlainObject(draft.palette)
            && Array.isArray(draft.palette.colors)
            && draft.palette.colors.every(color => typeof color === 'string')
            && (draft.palette.text === null || typeof draft.palette.text === 'string')
        ))
}
