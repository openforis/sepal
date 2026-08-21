import {MIN_SAMPLES_PER_STRATUM} from '#sepal/recipe/samplingDesign/minSamples'
import {DEFAULT_SAMPLING_GRID_CRS, DEFAULT_STRATIFICATION_CRS} from '#sepal/recipe/samplingDesign/samplingGridCrs'

// The seed a new design starts from. Any positive whole number would do; what matters is that it is fixed,
// so an unedited recipe samples the same points every time it is run.
const DEFAULT_SEED = 1

// What a new Sampling Design recipe starts as, and the only definition of it.
//
// Pure, and deliberately not part of the recipe module that submits tasks and talks to the store: the panels
// fill a recipe's missing values from here and the planner reads it to notice they are missing, and neither
// should have to reach through API calls, Redux and notifications to learn what a default is.
//
// A factory rather than a shared literal, because the model carries mutable values - an allocation mode
// array today, whatever a section grows tomorrow - and two recipes open at once must not share them.
export const getDefaultModel = () => ({
    // Stratification interprets a categorical source rather than placing points, so it starts from the plain
    // geographic CRS. Selecting a band replaces both fields with that band's own CRS and nominal Scale.
    stratification: {
        scale: 30,
        crs: DEFAULT_STRATIFICATION_CRS,
        type: 'ASSET'
    },
    // Automatic, fixed-size and Balanced: Balanced spreads a total from stratum identities and weights
    // alone, so it is the one automatic strategy that already means something before anyone has anticipated
    // a proportion. No total sample size and no counts - that total is the one number the design cannot
    // derive, and until it exists the section reports that it needs input rather than inventing a design
    // nobody chose.
    sampleAllocation: {
        requiresUpdate: false,
        manual: [],
        estimateSampleSize: false,
        allocationStrategy: 'BALANCED',
        confidenceLevel: 95,
        // Dormant while the mode is fixed-size: the target it belongs to is only read in error mode.
        marginOfError: 50,
        minSamplesPerStratum: String(MIN_SAMPLES_PER_STRATUM),
        powerTuningConstant: '0.5'
    },
    // Complete defaults so a new recipe opens the panel clean. minDistance is intentionally absent (resolved
    // at export, never frozen against its grid); requiresUpdate must be present so the mount-time set(false)
    // is a no-op rather than a dirtying change.
    sampleArrangement: {
        requiresUpdate: false,
        arrangementStrategy: 'RANDOM',
        sampleSizeStrategy: 'OVER',
        gridOrigin: 'FIXED',
        crs: DEFAULT_SAMPLING_GRID_CRS,
        seed: DEFAULT_SEED
    }
})

export const getDefaultSampleAllocation = () => getDefaultModel().sampleAllocation
