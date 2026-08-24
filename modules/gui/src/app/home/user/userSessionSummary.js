// What the session list says about one instance, as data: which usage metrics it has to show,
// whether the sampler reached a verdict, and what is running on it.
//
// Kept in its own module with no imports, in the sessionExpiryRules style, so it can be tested
// directly. Labels and number formatting stay in the component — this decides only WHAT is worth
// showing, which is where the rules that can be wrong live.

// usageMetrics — the sampled metrics in reading order (cpu, gpu, network, ram), or null when there
// is nothing to report. `usage` is already null when the sample is missing or stale (the report
// serializer's 5-minute guard), so anything here is live.
//
// A metric that was not measured is omitted rather than shown as zero: "not measured" and "measured
// as idle" are different claims, and the second is the one that gets an instance stopped. GPU is the
// exception — on a GPU instance an absent reading means nvidia-smi has not answered yet, and hiding
// the metric entirely on the very instances it matters for reads as a missing feature.
export const usageMetrics = session => {
    const usage = session?.usage
    if (!usage || usage.cpuPct === null || usage.cpuPct === undefined) {
        return null
    }
    return [
        {key: 'cpu', pct: usage.cpuPct},
        ...session.instanceType?.gpuCount ? [{key: 'gpu', pct: usage.gpuPct ?? 0}] : [],
        ...usage.netBytesPerS === null || usage.netBytesPerS === undefined
            ? []
            : [{key: 'net', bytesPerS: usage.netBytesPerS}],
        {key: 'ram', pct: usage.ramPct}
    ]
}

// verdictOf — 'busy' | 'unused', or null when the sampler has not reached a verdict for this
// session (too new, or below the sampling coverage floor). 'unused' is the word that tells a user
// their instance is about to be stopped, so it is never guessed from missing data.
export const verdictOf = session =>
    ['busy', 'unused'].includes(session?.verdict)
        ? session.verdict
        : null

// runningItems — what the instance is running, in the order the expiry notification and the expiry
// email list it: the apps, then the terminal sessions.
export const runningItems = session => [
    ...(session?.apps || []).map(({path, label}) => ({type: 'app', key: path, label: label || path})),
    ...session?.terminals > 0 ? [{type: 'terminals', key: 'terminals', count: session.terminals}] : []
]
