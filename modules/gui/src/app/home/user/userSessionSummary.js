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

// runningItems — what the instance is running: the apps, by the label the user opened them under.
//
// Terminal sessions are deliberately NOT included, here or in the expiry email. A count of open
// ptys is not something a user can act on — it names nothing, and an idle shell left open in a
// forgotten tab counts exactly the same as a running build. The sampler still tracks terminals;
// they feed the busy verdict and the interaction signal, which is where they are useful.
export const runningItems = session =>
    (session?.apps || []).map(({path, label}) => ({type: 'app', key: path, label: label || path}))

// instanceLabel — "1: humble-robin - t1", how the session list identifies one instance.
//
// The NUMBER leads because it is the position in this list and the same number the SSH menu
// accepts to join or stop (`1`, `1s`) — it is what a user acts on. The name follows as the
// identity every other surface uses for this machine: the expiry notification, the expiry email
// and its management page all say `humble-robin`, so the four never describe an instance
// differently.
//
// A session with no name (one predating them, or an event that arrived without one) collapses to
// "1: t1" rather than leaving a dangling separator.
//
// The type is the internal tag ("t1", "m4"), the same one the SSH menu lists and accepts, not the
// AWS name it maps to. Untagged legacy types have no tag to show, so they fall back to the name.
export const instanceLabel = (session, index) =>
    [`${index + 1}:`, session?.name, session?.name ? '-' : null, session?.instanceType?.tag ?? session?.instanceType?.name]
        .filter(Boolean)
        .join(' ')
