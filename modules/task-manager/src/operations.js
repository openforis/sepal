// Operations that download into the user's workspace and post-process on the main host.
export const LOCAL_OPERATIONS = ['image.SEPAL', 'image.DATA', 'timeseries.download', 'samplingDesign.SEPAL']

export const isLocalWork = operation => LOCAL_OPERATIONS.includes(operation)

// Operations that stage files outside the user's home on their way elsewhere.
const STAGING_OPERATIONS = ['image.DATA']

export const usesStaging = operation => STAGING_OPERATIONS.includes(operation)
