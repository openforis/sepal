import _ from 'lodash'

import {defineRecipeType} from '../defineRecipeType.js'
import {DUPLICATE_BAND_NAME, INCOMPLETE_IMAGE_OUTPUT, MISSING_INPUT_BAND} from '../output/diagnostic.js'
import {imageOutputProvider} from '../output/provider.js'
import {IMAGE_OUTPUT} from '../output/readiness.js'
import {isBlank} from '../source/extract.js'
import {fromInputImagery, INPUT_IMAGE, inputImageryRequirement, inputSourceKey} from '../source/inputImagery.js'

// Stack renames and concatenates its input images in model order (lib/js/ee/src/stack/stack.js). The output
// band names are a mapping over that list, not references.
//
// Each output band corresponds to one band of one input: the input images in model order, and within each the bands
// its `bandNames` entry maps, found by the image's id, in that entry's order. Selecting and renaming change neither
// values nor representation, so an output band takes its input band's dimensionality, pyramiding policy and encoding
// from that input's current description - never from the band lists copied into the model when it was selected. A
// scalar its input states no policy for is averaged at coarser levels, as Earth Engine's default always exported it;
// an array gets no policy it was not given.
//
// The mapping is checked before any input is read: an image without an entry, a blank name, or a final name already
// taken is known from the configuration alone, whatever the inputs turn out to hold. The refusal still names the inputs,
// and adds every mapped band missing from those that could be described - what a caller holds, or reads to explain the
// refusal - without ever delaying it.
//
// The names are kept by every commit (committedBandNames): the GUI's, through its applied derivation. Readers take the
// names as saved and never name a band themselves.

// An input image has no entry mapping its bands to output bands, so which of its bands are output cannot be known.
export const UNMAPPED_INPUT = 'UNMAPPED_INPUT'

export {INPUT_IMAGE}

const IMAGES_PATH = ['model', 'inputImagery', 'images']
const BAND_NAMES_PATH = ['model', 'bandNames', 'bandNames']

// Per input image, in model order: the bands its entry maps, or null for an image with no entry.
export const stackBandCorrespondence = model => {
    const entries = model?.bandNames?.bandNames || []
    return (model?.inputImagery?.images || []).map((image, imageIndex) => {
        const entryIndex = entries.findIndex(({imageId}) => imageId === image.imageId)
        return {
            image,
            path: [...IMAGES_PATH, imageIndex],
            bands: entryIndex < 0
                ? null
                : (entries[entryIndex].bands || []).map(({originalName, outputName}, bandIndex) => ({
                    originalName,
                    outputName,
                    path: [...BAND_NAMES_PATH, entryIndex, 'bands', bandIndex]
                }))
        }
    })
}

export const stackOutputNames = model =>
    stackBandCorrespondence(model).flatMap(({bands}) => (bands || []).map(({outputName}) => outputName))

// The band names a commit leaves a Stack with, from the model before the commit and the model as it leaves it:
// {bandNames, retired}. Each input's entry follows the bands it includes, by band id, or by original name for a band
// saved without one, where that tells it apart; an entry it does not is kept as saved, its names held, until the user
// names its bands (unresolvedBands). A name is the user's unless it is
// the one recorded as generated for its band (`automaticName`), and the user's are kept as given, colliding or not. In
// Stack order, an automatic name stays with its band unless one of the user's, or an earlier band's, holds it. Every
// band then left unnamed - new, cleared, displaced or saved blank - takes its own band's name, suffixed apart from the
// names held and from those a band of another source held before the commit or was retired for. A name no band holds
// after the commit is retired, with the band it named, so no later commit gives it to another source either.
export const committedBandNames = (previous, model) => {
    const entries = followedEntries(model)
    const held = new Set(entries.flatMap(heldNames))
    const owned = nameOwners(previous)
    const bandNames = entries
        .map(entry => entry.retained ? entry : {...entry, bands: entry.bands.map(band => keptName(band, held))})
        .map(({imageId, source, bands, retained}) => retained || {
            imageId,
            bands: bands.map(band => band.outputName === undefined ? allocatedName(band, source, held, owned) : band)
        })
    return {bandNames, retired: _.uniqWith(owned.filter(({name}) => !held.has(name)), _.isEqual)}
}

// The bands, [{imageId, id}], of the inputs whose saved names a commit cannot tell apart: saved without their bands'
// ids, where the input includes a band more than once or saved it under more than one name.
export const unresolvedBands = model =>
    followedEntries(model).flatMap(({imageId, unresolved = []}) => unresolved.map(id => ({imageId, id})))

// Per input image, the name its entry saved for each band it includes, matched as a commit matches it, and none for a
// band its saved names cannot tell apart: [{imageId, bands: [{id, outputName}]}].
export const savedBandNames = model => followedEntries(model).map(({imageId, bands = []}) => ({
    imageId,
    bands: bands.filter(({outputName}) => !isBlank(outputName)).map(({id, outputName}) => ({id, outputName}))
}))

// The refusals of a mapping known from the configuration alone, as the declaration refuses it.
export const stackMappingRefusals = model => mappingRefusals(stackBandCorrespondence(model))

// Each name the model gives, or retired, with the band it named: {name, source, band}, `source` its input's source.
export const nameOwners = model => [
    ...stackBandCorrespondence(model).flatMap(({image, bands}) => (bands || [])
        .filter(({outputName}) => !isBlank(outputName))
        .map(({originalName, outputName}) => ({name: outputName, source: inputSourceKey(image), band: originalName}))),
    ...(model?.bandNames?.retired || [])
]

// Whether a name named, or was retired for, a band other than this one of this source.
export const ownedElsewhere = (owners, name, {source, band}) =>
    owners.some(owner => owner.name === name && !(source !== null && owner.source === source && owner.band === band))

// Whether a band's name is the one generated for it, rather than the user's.
export const isAutomatic = band => !!band && !isBlank(band.outputName) && band.automaticName === band.outputName

export default defineRecipeType({
    type: 'STACK',
    directSources: model => fromInputImagery(model),
    executionNeeds: {[IMAGE_OUTPUT]: {[INPUT_IMAGE]: IMAGE_OUTPUT}},
    configurationRequirements: [inputImageryRequirement],
    imageOutput: imageOutputProvider({
        describe: ({recipe, inputs, describedInputs}) => {
            const correspondence = stackBandCorrespondence(recipe.model)
            const refusals = mappingRefusals(correspondence)
            if (refusals.length) {
                return {diagnostics: [...refusals, ...missingInputBands(correspondence, describedInputs())]}
            }
            const described = inputs()
            if (!described) {
                return null
            }
            const missing = missingInputBands(correspondence, described)
            return missing.length
                ? {diagnostics: missing}
                : {bands: correspondence.flatMap(({image, bands}) => bands.map(({originalName, outputName}) =>
                    outputBand(outputName, inputOf(image, described).description.output.bands.find(({name}) => name === originalName))
                )), evidence: []}
        }
    })
})

// Per input image, in model order, its source and the bands it includes, each named as its entry named it, a band it
// cannot tell apart left unnamed - and then the entry as saved (`retained`), with those bands (`unresolved`).
const followedEntries = model => {
    const entries = model?.bandNames?.bandNames || []
    return (model?.inputImagery?.images || []).map(image =>
        followedEntry(image, entries.find(({imageId}) => imageId === image.imageId)))
}

const followedEntry = (image, entry) => {
    const named = entry?.bands || []
    const included = image.includedBands || []
    const savedAs = ({id}) => !_.isNil(id) && named.find(band => band.id === id)
    const savedWithoutId = ({band}) => named.filter(({id, originalName}) => _.isNil(id) && originalName === band)
    const matchedByName = included.filter(band => !savedAs(band) && savedWithoutId(band).length)
    const unresolved = matchedByName.filter(band =>
        savedWithoutId(band).length > 1 || matchedByName.some(other => other !== band && other.band === band.band))
    const followed = {
        imageId: image.imageId,
        source: inputSourceKey(image),
        bands: included.map(band => namedAs(
            unresolved.includes(band) ? null : savedAs(band) || savedWithoutId(band)[0],
            {id: band.id, originalName: band.band}
        ))
    }
    return unresolved.length
        ? {...followed, retained: entry, unresolved: unresolved.map(({id}) => id)}
        : followed
}

const heldNames = ({bands, retained}) => retained
    ? (retained.bands || []).map(({outputName}) => outputName).filter(name => !isBlank(name))
    : bands.filter(isExplicit).map(({outputName}) => outputName)

const namedAs = (named, band) => {
    if (isExplicit(named)) {
        return {...band, outputName: named.outputName}
    }
    return isAutomatic(named)
        ? {...band, outputName: named.outputName, automaticName: named.automaticName}
        : band
}

const isExplicit = band => !!band && !isBlank(band.outputName) && band.automaticName !== band.outputName

const keptName = (band, held) => {
    if (!isAutomatic(band)) {
        return band
    }
    if (held.has(band.outputName)) {
        return {id: band.id, originalName: band.originalName}
    }
    held.add(band.outputName)
    return band
}

const allocatedName = (band, source, held, owned) => {
    if (isBlank(band.originalName)) {
        return band
    }
    const free = name => !held.has(name) && !ownedElsewhere(owned, name, {source, band: band.originalName})
    let name = band.originalName
    for (let suffix = 1; !free(name); suffix++) {
        name = `${band.originalName}_${suffix}`
    }
    held.add(name)
    return {...band, outputName: name, automaticName: name}
}

const inputOf = (image, described) => described.find(({description: {executionReference}}) =>
    executionReference.type === image.type && executionReference.id === image.id
)

// Every mapped band the description of its input does not hold, among the inputs described; an image without an entry
// maps none.
const missingInputBands = (correspondence, described) =>
    correspondence.flatMap(({image, bands}) => {
        const input = inputOf(image, described)
        if (!input || !bands) {
            return []
        }
        const available = new Set(input.description.output.bands.map(({name}) => name))
        return bands
            .filter(({originalName}) => !available.has(originalName))
            .map(({path}) => ({code: MISSING_INPUT_BAND, path: [...path, 'originalName']}))
    })

const mappingRefusals = correspondence => {
    const refusals = []
    const taken = new Set()
    correspondence.forEach(({bands, path: imagePath}) => {
        if (!bands) {
            refusals.push({code: UNMAPPED_INPUT, path: imagePath})
            return
        }
        bands.forEach(({originalName, outputName, path}) => {
            if (isBlank(originalName) || isBlank(outputName)) {
                refusals.push({code: INCOMPLETE_IMAGE_OUTPUT, path})
            } else if (taken.has(outputName)) {
                refusals.push({code: DUPLICATE_BAND_NAME, path: [...path, 'outputName']})
            } else {
                taken.add(outputName)
            }
        })
    })
    return refusals
}

const outputBand = (name, {dataType, pyramidingPolicy, encoding}) => {
    const policy = pyramidingPolicy ?? (dataType.arrayDimensions === 0 ? 'mean' : undefined)
    return {
        name,
        dataType,
        ...(policy && {pyramidingPolicy: policy}),
        ...(encoding && {encoding})
    }
}
