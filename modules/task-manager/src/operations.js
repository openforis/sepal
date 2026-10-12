// Operations that download into the user's workspace and post-process on the main host.
export const LOCAL_OPERATIONS = ['image.SEPAL', 'timeseries.download', 'samplingDesign.SEPAL']

export const isLocalWork = operation => LOCAL_OPERATIONS.includes(operation)
