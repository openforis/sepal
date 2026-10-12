import {LimiterService} from '#sepal/service/limiter'

// Concurrent starts for one user would each create the SEPAL/exports folders, or the bucket, a second time.
export const {limiterService: userStorageSerializerService, limiter$: userStorageSerializer$} =
    LimiterService('UserStorageSerializer', {maxConcurrency: 1})
