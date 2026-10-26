import _ from 'lodash'

import {auxiliaryImage} from '#sepal/ee/auxiliaryImagery'
import ee from '#sepal/ee/ee'
import {calculateIndex} from '#sepal/ee/optical/indexes'
import {validateEEImage} from '#sepal/ee/validate'
import {auxiliaryBands} from '#sepal/recipe/auxiliaryImagery'
import {REQUIRED_BANDS_BY_INDEX} from '#sepal/recipe/optical/opticalBands'

// The features Classification and Regression train on, sample and classify (lib/js/shared/src/recipe/bandSets.js
// declares the same rules for readiness).
//
// A recipe builds the features of each of its input images itself (addCovariates): what its band sets select - a band
// as it is, an index calculated of the standard bands it requires, overwriting a band of its name, band combinations
// of pairs, in the input's band order - with its configured covariates, masked where the input is masked everywhere.
// Concatenated in input order, Earth Engine names a repeated name apart (`latitude_1`).
//
// A recipe whose training data another reuses samples that recipe's features instead (definedFeatures), of its own input
// images at its own points: each feature of each of that recipe's inputs (featureDefinition), built in the form that
// recipe builds it, of the one of its own inputs that can - by name, for a band; of the standard bands, for a calculated
// index; of both operands, ordered as that recipe orders them, for a combination - whatever its own band sets select,
// however many inputs it has, in whatever order. A band is matched whatever its case where one band of the input matches
// it, and taken under the defining recipe's spelling; several - red beside Red - are no match, never ranked. A feature
// none of the inputs, or several, can supply, or one built of a band an input matches more than once, fails the
// evaluation, never taken from the first; so does a name two of the defining recipe's inputs both give, whatever its
// case, but for a configured covariate, which is generated once for each under its own name. Inputs supplying nothing
// are not sampled. As readiness judges the same (lib/js/shared/src/recipe/bandSets.js featureSupply).

// The features of an input image, as the recipe it is configured in builds them.
export const addCovariates = (image, bandSetSpecs, auxiliaryImagery) => {
    const bandSetSpecsImages = bandSetSpecs.map(({type, included, operation}) => {
        switch (type) {
            case 'IMAGE_BANDS':
                return image.selectExisting(included).addBands(
                    calculateIndexes(image, included), null, true
                )
            case 'PAIR_WISE_EXPRESSION':
                return combinePairwise(image, included, operation)
            case 'INDEXES':
                return calculateIndexes(image, included)
        }
    })
    return _.tail(bandSetSpecsImages)
        .reduce((acc, image) => acc.addBands(image, null, true), _.head(bandSetSpecsImages))
        .addBands(
            auxiliaryImagery.length
                ? auxiliaryImage(auxiliaryImagery)
                : ee.Image([]),
            null, true
        )
        .updateMask(
            image.mask().reduce(ee.Reducer.max())
        )
}

// What a recipe trains on, for the recipes whose training data it reuses to sample: for each of its input images, its
// band sets, the bands of the image (`inputBands`) and the names of its features (`names`), both as Earth Engine
// lists, with its configured covariates. `inputs` are {image, bandSetSpecs, features} in input order.
export const featureDefinition = (inputs, auxiliaryImagery) => ({
    auxiliaryImagery,
    inputs: inputs.map(({image, bandSetSpecs, features}) => ({
        bandSetSpecs,
        inputBands: image.bandNames(),
        names: features.bandNames()
    }))
})

// The features `definition` defines, built of `images` - the input images of the reused recipe named `provider` - for it
// to sample at its own points, named and ordered as the defining recipe's features are. Each is masked as its supplying
// input masks it; a covariate where the inputs supplying that defining input's features - or, supplying none, all of
// them - are.
export const definedFeatures = (images, {inputs, auxiliaryImagery}, providerName) => {
    const provider = asJsonText(providerName)
    const covariateNames = auxiliaryBands(auxiliaryImagery)
    const covariates = auxiliaryImagery.length ? auxiliaryImage(auxiliaryImagery) : ee.Image([])
    const supports = images.map(image => image.mask().reduce(ee.Reducer.max()))
    const definedNames = ee.List(inputs.map(({names}) => ee.List(names).removeAll(covariateNames))).flatten()
        .map(name => ee.String(name).toLowerCase())
    return validateEEImage({
        valid: definedNames.size().eq(definedNames.distinct().size()),
        image: ee.Image(inputs.map(input => inputFeatures({images, supports, input, covariateNames, covariates, provider}))),
        error: {
            userMessage: {
                message: `The recipe reusing the training data of ${providerName} has input images giving one feature name more than once, whatever its case. ${DISTINCT_NAMES}`,
                key: 'process.classification.trainingFeatures.ambiguousDefinition',
                args: {provider: String(providerName)}
            },
            statusCode: 400
        }
    })
}

const DISTINCT_NAMES = 'Give the bands distinct names in a Stack\'s Band names panel, and use that Stack in both recipes.'

// Where the samples of `features` are taken on their grid: the first defined feature that is no covariate, as supplied -
// what the recipe's own features would have put first - or, defining covariates alone, the first band of its first input.
export const samplingProjection = (features, images, {inputs, auxiliaryImagery}) => {
    const definedNames = ee.List(inputs.map(({names}) => ee.List(names).removeAll(auxiliaryBands(auxiliaryImagery)))).flatten()
    return ee.Projection(ee.Algorithms.If(
        definedNames.size().gt(0),
        features.select([definedNames.get(0)]).projection(),
        images[0].select(0).projection()
    ))
}

// One input's features, in the defining input's order and names: each data feature from the one input of the reused
// recipe that can supply it (supplied), each covariate generated, masked where the inputs supplying the rest are.
const inputFeatures = ({images, supports, input: {bandSetSpecs, inputBands, names}, covariateNames, covariates, provider}) => {
    const requests = effectiveRequests(requestsOf(bandSetSpecs, inputBands), names, covariateNames)
    const supplying = ee.ImageCollection.fromImages(supports.map((support, imageIndex) => support.set(
        'supplies',
        ee.Algorithms.If(
            ee.List(names).removeAll(covariateNames).size().eq(0),
            1,
            anyOf(requests.map(request => andOf(request.effective, eligible(images[imageIndex], request))))
        )
    ))).filter(ee.Filter.eq('supplies', 1))
    const support = ee.Image(ee.Algorithms.If(supplying.size().gt(0), supplying.min(), ee.Image(1)))
    const supplied = ee.Image(requests.map(request => ee.Image(ee.Algorithms.If(
        request.effective,
        suppliedBy(images, supports, request, provider),
        ee.Image([])
    ))))
    return ee.Image(ee.List(names).iterate(
        (name, acc) => ee.Image(acc).addBands(ee.Image(ee.Algorithms.If(
            ee.List(covariateNames).contains(name),
            covariates.select([name]).updateMask(support),
            supplied.select([name])
        ))),
        ee.Image([])
    ))
}

// What each of the defining input's band sets asks of an input, in the form it builds each, as featuresOf declares them
// (lib/js/shared/src/recipe/bandSets.js): {set, name, bands, given, build}. `bands` are the bands it is built of,
// `given` whether the defining input gives it at all - holds the band, can calculate the index, holds both operands -
// and `build` makes it of an image holding `bands` under those names. A band an index is named for is the index where
// the input can calculate it, the band otherwise.
const requestsOf = (bandSetSpecs, inputBands) => bandSetSpecs.flatMap(({type, included = [], operation}, set) => {
    const holds = bands => ee.List(bands).removeAll(inputBands).size().eq(0)
    const derivable = name => REQUIRED_BANDS_BY_INDEX[name] ? holds(REQUIRED_BANDS_BY_INDEX[name]) : false
    const names = _.uniq(included)
    switch (type) {
        case 'IMAGE_BANDS':
            return names.flatMap(name => [
                ...REQUIRED_BANDS_BY_INDEX[name] ? [calculation(set, name, derivable(name))] : [],
                {set, name: ee.String(name), bands: [name], given: andOf(holds([name]), notOf(derivable(name))), build: image => image.select([name])}
            ])
        case 'INDEXES':
            return names.filter(name => REQUIRED_BANDS_BY_INDEX[name]).map(name => calculation(set, name, derivable(name)))
        case 'PAIR_WISE_EXPRESSION':
            return names.flatMap((first, i) => names.slice(i + 1).map(second => combination(set, first, second, operation, inputBands)))
        default:
            return []
    }
})

const calculation = (set, name, derivable) => ({
    set,
    name: ee.String(name),
    bands: REQUIRED_BANDS_BY_INDEX[name],
    given: derivable,
    build: image => calculateIndex(image, name)
})

// A pair of bands combined in the order the defining input holds them, named as it names it: `first` and `second` are as
// configured. Two that differ only in case would match one band of another recipe twice, which no sample can tell apart.
const combination = (set, first, second, operation, inputBands) => {
    const inOrder = ee.List(inputBands).indexOf(first).lt(ee.List(inputBands).indexOf(second))
    const operands = ee.List(ee.Algorithms.If(inOrder, [first, second], [second, first]))
    const suffix = `_${operation.toLowerCase()}`
    return {
        set,
        name: ee.String(operands.get(0)).cat('_').cat(operands.get(1)).cat(suffix),
        bands: [first, second],
        given: ee.List(inputBands).removeAll([first, second]).size().eq(ee.List(inputBands).size().subtract(2)),
        build: image => combinePairwise(image.select(operands), [first, second], operation),
        caseless: first.toLowerCase() === second.toLowerCase()
    }
}

// The requests that give the defining input's features: given, a feature of it, and overwritten neither by a configured
// covariate nor by a later band set giving the same name - as execution overwrites them (addCovariates). A band named as
// a covariate still combines with others.
const effectiveRequests = (requests, names, covariateNames) => requests.map(request => ({
    ...request,
    effective: andOf(
        request.given,
        ee.List(names).contains(request.name),
        notOf(ee.List(covariateNames).contains(request.name)),
        notOf(anyOf(requests
            .filter(later => later.set > request.set)
            .map(later => andOf(later.given, later.name.equals(request.name)))))
    )
}))

// The image's bands matching `band` whatever their case.
const matching = (image, band) => image.bandNames().map(name => ee.Algorithms.If(
    ee.String(name).toLowerCase().equals(ee.String(band).toLowerCase()),
    name,
    null
), true)

// Whether an image can supply a request: it holds every band it is built of, whatever their case. Whether it holds one
// more than once matters only then.
const eligible = (image, {bands}) => andOf(...bands.map(band => matching(image, band).size().gte(1)))

const collides = (image, {bands}) => anyOf(bands.map(band => matching(image, band).size().gt(1)))

// A request built of the one input image eligible for it, its bands under the defining input's spellings and masked as
// that input is; none, several, or one holding a band of it more than once, fail the evaluation, never the first taken.
const suppliedBy = (images, supports, request, provider) => {
    if (request.caseless) {
        return failing(caselessOperands(provider, request))
    }
    const eligibility = images.map(image => eligible(image, request))
    const count = ee.List(eligibility.map(isEligible => ee.Algorithms.If(isEligible, 1, 0))).reduce(ee.Reducer.sum())
    const colliding = anyOf(images.map((image, imageIndex) => andOf(eligibility[imageIndex], collides(image, request))))
    const built = images.reduceRight(
        (otherwise, image, imageIndex) => ee.Image(ee.Algorithms.If(
            eligibility[imageIndex],
            request.build(ee.Image(request.bands.map(band => image.select([matching(image, band).get(0)], [band]))))
                .updateMask(supports[imageIndex]),
            otherwise
        )),
        ee.Image([])
    )
    return ee.Image(ee.Algorithms.If(
        andOf(ee.Number(count).eq(1), notOf(colliding)),
        built,
        failing(ee.String(ee.Algorithms.If(
            ee.Number(count).eq(0),
            missing(provider, request),
            ambiguous(provider, request, images, eligibility)
        )))
    ))
}

const andOf = (...conditions) => conditions.reduce((acc, condition) => acc.and(truth(condition)), ee.Number(1))

const anyOf = conditions => conditions.reduce((acc, condition) => acc.or(truth(condition)), ee.Number(0))

const notOf = condition => truth(condition).not()

// A condition as the number Earth Engine's Number operations take: List.contains and String.equals give a Boolean.
const truth = condition => ee.Number(ee.Algorithms.If(condition, 1, 0))

// The evaluation's errors: for a feature no input image supplies, naming the bands it is built of where it is derived;
// for one several supply, or one holds a band of more than once, naming each eligible input's matching bands as spelled.
const missing = (provider, {name, bands}) => encodedError({
    message: ee.String(`No input image of ${provider} supplies `).cat(name)
        .cat(bands.length > 1 ? `, built of ${bands.join(', ')}, which one input image must hold.` : '.'),
    key: 'process.classification.trainingFeatures.missing',
    name,
    provider
})

const ambiguous = (provider, request, images, eligibility) => {
    const conflicts = ee.List(images.map((image, imageIndex) => ee.Algorithms.If(
        eligibility[imageIndex],
        ee.String(`input image ${imageIndex + 1}: `).cat(ee.List(request.bands.map(band => matching(image, band))).flatten().join(', ')),
        ''
    ))).removeAll([''])
    return encodedError({
        message: ee.String(`More than one band of the input images of ${provider} matches `).cat(request.name).cat(' (')
            .cat(conflicts.join('; ')).cat(`). ${DISTINCT_NAMES}`),
        key: 'process.classification.trainingFeatures.ambiguous',
        name: request.name,
        provider
    })
}

const caselessOperands = (provider, {name, bands}) => encodedError({
    message: ee.String(`The recipe reusing the training data of ${provider} combines ${bands.join(' and ')} into `).cat(name)
        .cat(`, which differ only in case. ${DISTINCT_NAMES}`),
    key: 'process.classification.trainingFeatures.ambiguousDefinition',
    name,
    provider
})

// A name as it stands inside a JSON string.
const asJsonText = name => JSON.stringify(String(name)).slice(1, -1)

// An image failing, once evaluated, with an error naming what only evaluation knows. Earth Engine refuses a computed
// image id outright, as it refuses no missing key until asked for it: the error quoting the key carries the encoded
// error, decoded as encodeError's are (lib/js/ee/src/exception.js).
const failing = error => ee.Image(ee.Dictionary({}).get(error))

// An error Earth Engine reports once evaluated, decoded as encodeError's are (lib/js/ee/src/exception.js).
const encodedError = ({message, key, name, provider}) => ee.String('[error: {"userMessage":{"message":"')
    .cat(message)
    .cat(`","key":"${key}","args":{"feature":"`)
    .cat(name)
    .cat(`","provider":"${provider}"}},"statusCode":400}]`)

const combinePairwise = (image, bands, operation) => {
    const operations = {
        RATIO: 'b1 / b2',
        NORMALIZED_DIFFERENCE: '(b1 - b2) / (b1 + b2)',
        DIFFERENCE: 'b1 - b2',
        DISTANCE: 'atan2(b1, b2) / PI',
        ANGLE: 'hypot(b1, b2)'
    }
    return image
        .selectExisting(bands)
        .combinePairwise(operations[operation], `_${operation.toLowerCase()}`)
}

const calculateIndexes = (image, indexNames) =>
    ee.Image(
        indexNames.map(indexName => calculateIndex(image, indexName))
    )
