// SandboxSessionApiKey — an injectable {apiKeyForInstance(instanceId)} plus a retry wrapper.
//
// apiKeyForInstance is called at the START of provisionInstance, when the session row may not
// be committed yet, so a 5×50ms retry loop bridges that timing gap.
//
// NULL_API_KEY_IMPL is the null-object default (returns null → apiKey = '').

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// createApiKeyRetryWrapper — wraps any {apiKeyForInstance} impl with 5×50ms retry.
// Returns null if all retries are exhausted (not a throw — null maps to apiKey='').
//
// _sleep is an injectable seam (same `_` convention as dockerInstanceProvisioner's
// _dockerRetries/_dockerRetryDelayMs) so tests can observe the backoff without waiting on it.
// Do NOT reach for jest fake timers instead: under Jest's ESM mode useRealTimers() DELETES
// globalThis.setTimeout rather than restoring it, breaking every later test in the file that
// sleeps.
const createApiKeyRetryWrapper = (impl, {retries = 5, delayMs = 50, _sleep = sleep} = {}) => ({
    apiKeyForInstance: async instanceId => {
        for (let attempt = 0; attempt < retries; attempt++) {
            const key = await impl.apiKeyForInstance(instanceId)
            if (key != null) {
                return key
            }
            if (attempt < retries - 1) {
                await _sleep(delayMs)
            }
        }
        return null
    }
})

// NULL_API_KEY_IMPL — null-object default: no api key.
const NULL_API_KEY_IMPL = {
    apiKeyForInstance: _instanceId => null
}

export {createApiKeyRetryWrapper, NULL_API_KEY_IMPL}
