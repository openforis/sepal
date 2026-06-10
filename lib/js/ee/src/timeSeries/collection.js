import _ from 'lodash'
import {map, of, switchMap} from 'rxjs'

import {toGeometry} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import addTasseledCap from '#sepal/ee/optical/addTasseledCap'
import {allScenes as createOpticalCollection} from '#sepal/ee/optical/collection'
import {calculateIndex, supportedIndexes} from '#sepal/ee/optical/indexes'
import {createCollection as createPlanetCollection} from '#sepal/ee/planet/collection'
import {createCollection as createRadarCollection} from '#sepal/ee/radar/collection'
import recipeRef from '#sepal/ee/recipeRef'
import {validateEEImageCollection} from '#sepal/ee/validate'

const CLASSIFICATION_BANDS = ['regression', 'probability_.*']

export const getCollection$ = ({recipe, geometry: geo, startDate: sd, endDate: ed, bands}) => {
    const geometry = geo || toGeometry(recipe.model.aoi)
    const startDate = sd || recipe.model.dates.startDate
    const endDate = ed || recipe.model.dates.endDate
    const dataSets = recipe.model.sources.dataSets
    const cloudPercentageThreshold = recipe.model.sources.cloudPercentageThreshold
    const classification = recipe.model.sources.classification
    const surfaceReflectance = recipe.model.options.corrections?.includes('SR')
    const brdfCorrect = recipe.model.options.corrections?.includes('BRDF')
    const calibrate = true
    const {
        brdfMultiplier, includedCloudMasking, sentinel2CloudProbabilityMaxCloudProbability, sentinel2CloudScorePlusBand, sentinel2CloudScorePlusMaxCloudProbability,
        landsatCFMaskCloudMasking, landsatCFMaskCloudShadowMasking, landsatCFMaskCirrusMasking, landsatCFMaskDilatedCloud,
        sepalCloudScoreMaxCloudProbability, holes, cloudBuffer, shadowMasking, snowMasking, orbitOverlap, tileOverlap, // Optical
        orbits, geometricCorrection, outlierRemoval, orbitNumbers, spatialSpeckleFilter, // Radar
        kernelSize, sigma, strongScattererValues, snicSize, snicCompactness,  // Radar
        multitemporalSpeckleFilter, numberOfImages, minNumberOfImages, mask, minAngle, maxAngle, minObservations, // Radar
        cloudThreshold, shadowThreshold, histogramMatching // Planet
    } = recipe.model.options

    const opticalImages = (classificationRecipe, trainingData) => {
        const collection = createOpticalCollection({
            geometry,
            dataSets: extractDataSets(dataSets),
            reflectance,
            histogramMatching,
            filters: [],
            cloudPercentageThreshold,
            cloudBuffer,
            includedCloudMasking,
            sentinel2CloudProbabilityMaxCloudProbability,
            sentinel2CloudScorePlusBand,
            sentinel2CloudScorePlusMaxCloudProbability,
            landsatCFMaskCloudMasking,
            landsatCFMaskCloudShadowMasking,
            landsatCFMaskCirrusMasking,
            landsatCFMaskDilatedCloud,
            sepalCloudScoreMaxCloudProbability,
            holes,
            shadowMasking,
            snowMasking,
            orbitOverlap,
            tileOverlap,
            panSharpen: false,
            calibrate,
            brdfCorrect,
            brdfMultiplier,
            dates: {
                seasonStart: startDate,
                seasonEnd: endDate
            }
        })

        const addClassificationBands = image => {
            if (classificationRecipe) {
                const classification = classificationRecipe.classifyImage(image, CLASSIFICATION_BANDS, trainingData)
                const regression = scale(classification.selectExisting(['regression']), 1000)
                const probabilityBands = bands.filter(band => band.startsWith('probability_'))
                const probabilities = scale(classification.selectExisting(probabilityBands), 100)
                return image
                    .addBands(regression)
                    .addBands(probabilities)
            } else {
                return image
            }
        }

        const processImage = image => {
            const bandsToInclude = classificationRecipe
                ? [
                    ...bands,
                    ...['brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'],
                    ...supportedIndexes()
                ]
                : bands
            const indexes = ee.Image(
                bandsToInclude.filter(band => supportedIndexes().includes(band))
                    .map(indexName => scale(calculateIndex(image, indexName), 10000))
            )
            return addClassificationBands(
                addTasseledCap(image, bandsToInclude)
                    .addBands(indexes, null, true)
            )
                .select(bands)
                .int16()
                .clip(geometry)
                .set('date', image.date().format('yyyy-MM-dd'))
        }

        return collection.map(processImage)
    }

    const radarImages = (classificationRecipe, trainingData) => {
        const collection = createRadarCollection({
            startDate, endDate, targetDate: startDate, geometry,
            orbits, geometricCorrection, outlierRemoval, orbitNumbers, spatialSpeckleFilter,
            kernelSize, sigma, strongScattererValues, snicSize, snicCompactness, multitemporalSpeckleFilter, numberOfImages, minNumberOfImages, mask, minAngle, maxAngle, minObservations
        })

        const processImage = image => {
            if (classificationRecipe) {
                image = image.addBands(
                    classificationRecipe.classifyImage(image, CLASSIFICATION_BANDS, trainingData),
                    null, true
                )
            }
            if (bands.includes('ratio_VV_VH')) {
                image = image
                    .addBands(
                        image.select('VV').divide(image.select('VH')).rename('ratio_VV_VH')
                    )
            }
            return image
                .addBands(
                    scale(image.selectExisting(['VV', 'VH']), 100),
                    null, true
                )
                .addBands(
                    scale(image.selectExisting(['ratio_VV_VH']), 1000),
                    null, true
                )
                .int16()
                .set('date', image.date().format('yyyy-MM-dd'))
        }

        return collection.map(processImage)
    }

    const planetImages = (classificationRecipe, trainingData) => {
        const sources = recipe.model.sources
        const collection = createPlanetCollection({
            startDate,
            endDate,
            geometry,
            sources: {...sources, source: Object.values(sources.dataSets).flat()[0]},
            histogramMatching,
            cloudThreshold,
            shadowThreshold,
            cloudBuffer
        })

        const processImage = image => {
            if (classificationRecipe) {
                image = image.addBands(
                    classificationRecipe.classifyImage(image, CLASSIFICATION_BANDS, trainingData),
                    null, true
                )
            }

            const bandsToInclude = classificationRecipe
                ? [
                    ...bands,
                    ...supportedIndexes()
                ]
                : bands
            const indexes = ee.Image(
                bandsToInclude.filter(band => supportedIndexes().includes(band))
                    .map(indexName => scale(calculateIndex(image, indexName), 10000))
            )
            return image
                .addBands(indexes, null, true)
                .select(bands)
                .int16()
                .clip(geometry)
                .set('date', image.date().format('yyyy-MM-dd'))
        }
        return collection.map(processImage)
    }
    const isRadar = () => _.isEqual(Object.values(dataSets).flat(), ['SENTINEL_1'])
    const isOptical = () => Object.keys(dataSets).find(type => ['LANDSAT', 'SENTINEL_2'].includes(type))

    const extractDataSets = sources =>
        Object.values(sources)
            .flat()
            .map(dataSet =>
                dataSet === 'LANDSAT_TM'
                    ? ['LANDSAT_4', 'LANDSAT_5']
                    : dataSet === 'LANDSAT_TM_T2'
                        ? ['LANDSAT_4_T2', 'LANDSAT_5_T2']
                        : dataSet
            )
            .flat()

    const classificationRecipe$ = classification
        ? recipeRef({id: classification}).getRecipe$()
        : of(null)
    const reflectance = surfaceReflectance ? 'SR' : 'TOA'

    return classificationRecipe$.pipe(
        switchMap(classificationRecipe =>
            (classificationRecipe
                ? classificationRecipe.getTrainingData$()
                : of(null)).pipe(
                map(trainingData => {
                    return isRadar()
                        ? radarImages(classificationRecipe, trainingData)
                        : isOptical()
                            ? opticalImages(classificationRecipe, trainingData)
                            : planetImages(classificationRecipe, trainingData)
                })
            )),
        map(collection => {
            return validateEEImageCollection({
                valid: collection.limit(1).size(),
                imageCollection: collection,
                error: {
                    userMessage: {
                        message: 'All images have been filtered out. Update the recipe to ensure at least one image is included.',
                        key: 'process.mosaic.error.noImages'
                    },
                    statusCode: 400
                }
            })
        })
    )
}

const scale = (image, factor) =>
    image.multiply(
        ee.ImageCollection(
            ee.List.repeat(ee.Image(factor), image.bandNames().size())
        ).toBands()
    )
