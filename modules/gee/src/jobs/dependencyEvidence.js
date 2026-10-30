import _ from 'lodash'
import {defer, from, map, switchMap} from 'rxjs'

import {ClientException} from '#sepal/exception'
import {digestOf} from '#sepal/recipe/calculation/digest'
import {productProjection} from '#sepal/recipe/calculation/productProjection'
import {STRATUM_FRAME, STRATUM_FRAME_CONTRACT, stratumFrameRoot} from '#sepal/recipe/samplingDesign/stratumFrame'
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
    [STRATUM_FRAME, {contractVersion: STRATUM_FRAME_CONTRACT, root: stratumFrameRoot}]
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

// A calculation answered with the evidence of what it read. The dependency is read first, through the request's
// RecipeScope, so the calculation builds from the same records; the assets are read again once it has answered, and
// a token that moved meanwhile refuses the answer rather than attach evidence it was not calculated from.
export const withDependencyEvidence$ = ({dependency, question, calculate$}) =>
    dependencyEvidence$(dependency, question).pipe(
        switchMap(evidence => calculate$().pipe(
            switchMap(result => assetVersions$(evidence.provenance.assets.map(({id}) => id)).pipe(
                map(answers => {
                    const changed = answers
                        .filter(({id, version, failure}) => failure || (version ?? null) !== tokenOf(evidence, id))
                        .map(({id}) => id)
                    if (changed.length) {
                        throw supersededError(changed)
                    }
                    return {result, evidence}
                })
            ))
        ))
    )

const tokenOf = (evidence, assetId) => evidence.provenance.assets.find(({id}) => id === assetId)?.version ?? null

const supersededError = assetIds => new ClientException(`Inputs changed during the calculation: ${assetIds.join(', ')}`, {
    userMessage: {
        message: `${assetIds.join(', ')} changed while this was calculated. Recalculate.`,
        key: 'gee.dependencyEvidence.superseded',
        args: {assetIds: assetIds.join(', ')}
    },
    errorCode: SUPERSEDED
})
