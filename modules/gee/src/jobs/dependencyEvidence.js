import _ from 'lodash'
import {defer, forkJoin, from, map, switchMap} from 'rxjs'

import {ClientException} from '#sepal/exception'
import {digestOf} from '#sepal/recipe/calculation/digest'
import {productProjection} from '#sepal/recipe/calculation/productProjection'
import {STRATUM_FRAME, STRATUM_FRAME_CONTRACT, stratumFrameRoot} from '#sepal/recipe/samplingDesign/stratumFrame'
import {
    PROBABILITY_SOURCE,
    PROBABILITY_SOURCE_CONTRACT,
    probabilitySourceRoot
} from '#sepal/recipe/samplingDesign/stratumProbabilities'
import {RECIPE_REF} from '#sepal/recipe/source/reference'

import {assetVersions$} from './ee/asset/versions.js'
import {recipeClosure$} from './executionReadiness.js'

// Evidence of what a dependency's question reads now, in the shape calculation/freshness.js judges: the dependency's
// closure, read through this request's RecipeScope as everything else the request builds is - one record per recipe -
// each recipe projected by its own type, and every asset the closure names with its token. The calculating operations,
// the task's stages and the GUI's acquisition all take it from here, so what a question means is defined once.
//
// A token detects the changes Earth Engine reports; it does not pin the pixels a later evaluation reads.

const PRODUCERS = new Map([
    [STRATUM_FRAME, {contractVersion: STRATUM_FRAME_CONTRACT, root: stratumFrameRoot}],
    [PROBABILITY_SOURCE, {contractVersion: PROBABILITY_SOURCE_CONTRACT, root: probabilitySourceRoot}]
])

export const SUPERSEDED = 'CALCULATION_INPUTS_CHANGED'

export const dependencyEvidence$ = (dependency, question) => defer(() => {
    const producer = PRODUCERS.get(dependency)
    if (!producer) {
        throw new ClientException(`Not a dependency: ${dependency}`)
    }
    const root = producer.root(question)
    return recipeClosure$(root).pipe(
        switchMap(({graph}) => {
            const recipes = _.sortBy(graph.recipes.filter(({id}) => id !== root.id), 'id')
            const assetIds = _.uniq(graph.edges.filter(({reference}) => reference.type !== RECIPE_REF).map(({reference}) => reference.id)).sort()
            return assetVersions$(assetIds).pipe(
                switchMap(answers => {
                    const unread = answers.filter(({failure}) => failure)
                    if (unread.length) {
                        throw new ClientException(`Cannot read ${unread.map(({id}) => id).join(', ')}`, {
                            userMessage: {
                                message: `Cannot read ${unread.map(({id}) => id).join(', ')}`,
                                key: 'gee.dependencyEvidence.assetUnreadable',
                                args: {assetIds: unread.map(({id}) => id).join(', ')}
                            }
                        })
                    }
                    const assets = answers.map(({id, version}) => ({id, version: version ?? null}))
                    const meaning = {
                        dependency,
                        contractVersion: producer.contractVersion,
                        question,
                        recipes: recipes.map(record => ({id: record.id, type: record.type, projection: productProjection(record)})),
                        assets
                    }
                    return from(digestOf(meaning)).pipe(
                        map(digest => ({
                            dependency,
                            contractVersion: producer.contractVersion,
                            question,
                            digest,
                            provenance: {
                                recipes: recipes.map(({id, revision}) => ({id, revision: revision ?? null})),
                                assets
                            },
                            unversioned: answers.filter(({unversioned}) => unversioned).map(({id}) => id)
                        }))
                    )
                })
            )
        })
    )
})

// A calculation answered with the evidence of what it read: `dependencies` is {[dependency]: question}, answered as
// `evidence`, {[dependency]: evidence}. Each is read first, through the request's RecipeScope, so the calculation builds
// from the same records; the assets are read again once it has answered, and a token that moved meanwhile refuses the
// answer rather than attach evidence it was not calculated from. An asset two dependencies read is checked against
// what each of them observed, which differ where it was replaced between their reads.
export const withDependencyEvidence$ = ({dependencies, calculate$}) =>
    forkJoin(_.mapValues(dependencies, (question, dependency) => dependencyEvidence$(dependency, question))).pipe(
        switchMap(evidence => calculate$().pipe(
            switchMap(result => {
                const observed = Object.values(evidence).flatMap(({provenance}) => provenance.assets)
                return assetVersions$(_.uniq(observed.map(({id}) => id))).pipe(
                    map(answers => {
                        const changed = movedSince(observed, answers)
                        if (changed.length) {
                            throw supersededError(changed)
                        }
                        return {result, evidence}
                    })
                )
            })
        ))
    )

const movedSince = (observed, answers) => {
    const reread = new Map(answers.map(answer => [answer.id, answer]))
    return _.uniq(observed
        .filter(({id, version}) => {
            const answer = reread.get(id)
            return !answer || answer.failure || (answer.version ?? null) !== version
        })
        .map(({id}) => id))
}

const supersededError = assetIds => new ClientException(`Inputs changed during the calculation: ${assetIds.join(', ')}`, {
    userMessage: {
        message: `${assetIds.join(', ')} changed while this was calculated. Recalculate.`,
        key: 'gee.dependencyEvidence.superseded',
        args: {assetIds: assetIds.join(', ')}
    },
    errorCode: SUPERSEDED
})
