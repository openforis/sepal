// What the session list says about one instance, as data: which usage metrics it has to show and
// what is running on it.
//
// Kept in its own module with no imports, in the sessionExpiryRules style, so it can be tested
// directly. Labels and number formatting stay in the component — this decides only WHAT is worth
// showing, which is where the rules that can be wrong live.

// usageMetrics — the sampled metrics in reading order (cpu, gpu, ram, network), or null when there
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
        {key: 'ram', pct: usage.ramPct},
        ...usage.netBytesPerS === null || usage.netBytesPerS === undefined
            ? []
            : [{key: 'net', bytesPerS: usage.netBytesPerS}]
    ]
}

// runningItems — what the instance is running: the apps, by the label the user opened them under.
//
// Terminal sessions are deliberately NOT included, here or in the expiry email. A count of open
// ptys is not something a user can act on — it names nothing, and an idle shell left open in a
// forgotten tab counts exactly the same as a running build. The sampler still tracks terminals;
// they feed the busy verdict and the interaction signal, which is where they are useful.
export const runningItems = session =>
    (session?.apps || []).map(({path, label}) => ({type: 'app', key: path, label: label || path}))

// instanceLabel — "1: humble-robin - t1", how the instance picker identifies a running instance.
//
// The NUMBER leads because it is the position in the session report and the same number the SSH
// menu accepts to join or stop (`1`, `1s`) — it is what a user acts on. The name follows as the
// identity every other surface uses for this machine: the session list, the expiry notification,
// the expiry email and its management page all say `humble-robin`.
//
// A session with no name (one predating them, or an event that arrived without one) collapses to
// "1: t1" rather than leaving a dangling separator.
export const instanceLabel = (session, index) =>
    [`${index + 1}:`, session?.name, session?.name ? '-' : null, instanceTypeLabel(session)]
        .filter(Boolean)
        .join(' ')

// instanceTypeLabel — the internal tag ("t1", "m4"), the same one the SSH menu lists and accepts,
// not the AWS name it maps to. Untagged legacy types have no tag to show, so they fall back to the
// name.
export const instanceTypeLabel = session =>
    session?.instanceType?.tag ?? session?.instanceType?.name
