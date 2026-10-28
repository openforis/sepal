// Stage progress of the sampling-design steps, shown as the task status between the Earth Engine exports.

export const SYSTEMATIC_PROGRESS = {
    prepareBase: {messageKey: 'tasks.samplingDesign.systematic.progress.prepareBaseCandidates', defaultMessage: 'Finding systematic sample locations'},
    checkBase: {messageKey: 'tasks.samplingDesign.systematic.progress.checkBaseCandidates', defaultMessage: 'Checking systematic sample locations'},
    prepareRepair: {messageKey: 'tasks.samplingDesign.systematic.progress.prepareRepairCandidates', defaultMessage: 'Finding additional sample locations'},
    checkRepair: {messageKey: 'tasks.samplingDesign.systematic.progress.checkRepairCandidates', defaultMessage: 'Checking additional sample locations'},
    exportFinal: {messageKey: 'tasks.samplingDesign.systematic.progress.exportFinal', defaultMessage: 'Exporting samples'}
}

export const RANDOM_PROGRESS = {
    prepareCandidates: {messageKey: 'tasks.samplingDesign.random.progress.prepareCandidates', defaultMessage: 'Finding random sample locations'},
    checkCandidates: {messageKey: 'tasks.samplingDesign.random.progress.checkCandidates', defaultMessage: 'Checking random sample locations'},
    exportFinal: {messageKey: 'tasks.samplingDesign.random.progress.exportFinal', defaultMessage: 'Exporting samples'}
}
