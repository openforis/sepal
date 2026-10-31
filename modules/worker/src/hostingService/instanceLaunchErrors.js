// Classification of instance-launch failures by EC2 error code (the AWS SDK v3 exposes it
// as error.name). The two buckets a user can act on:
//   INSTANCE_UNAVAILABLE — this instance type cannot be provided right now:
//     InsufficientInstanceCapacity (no capacity in the availability zone) or
//     Unsupported (the type is not offered in the availability zone at all).
//   QUOTA_EXCEEDED — the account's limits, not AWS capacity:
//     InstanceLimitExceeded / VcpuLimitExceeded, or the regional volume initialization rate quota
//     (VOLUME_INITIALIZATION_RATE), which frees up as volumes finish initializing.
// Anything else returns null — the caller keeps its generic error handling.
// Wrapped errors (e.g. FailedToTagInstance with {cause}) are classified by walking the chain.

const CODES = {
    InsufficientInstanceCapacity: 'INSTANCE_UNAVAILABLE',
    Unsupported: 'INSTANCE_UNAVAILABLE',
    InstanceLimitExceeded: 'QUOTA_EXCEEDED',
    VcpuLimitExceeded: 'QUOTA_EXCEEDED',
}

// EC2 documents no error code for the volume initialization rate quota, so its message identifies it.
const VOLUME_INITIALIZATION_QUOTA = /quota for the cumulative volume initialization rate/i

const launchFailureCode = error =>
    error
        ? CODES[error.name]
            ?? (VOLUME_INITIALIZATION_QUOTA.test(error.message) ? 'QUOTA_EXCEEDED' : null)
            ?? launchFailureCode(error.cause)
        : null

export {launchFailureCode}
