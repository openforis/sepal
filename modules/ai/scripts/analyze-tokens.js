#!/usr/bin/env node

// Parses ai-module log lines from stdin, pairs each LLM request with its
// usage by callId, groups by conversation + turn, prints a diagnostic
// table. Intended use:
//
//   docker logs ai 2>&1 | node modules/ai/scripts/analyze-tokens.js
//   docker logs -f ai | node modules/ai/scripts/analyze-tokens.js   # live
//
// Flags:
//   --conversation <id>   only show this conversation
//   --since <iso-time>    drop lines with a timestamp before this
//   --json                emit one JSON object per call instead of a table

const readline = require('readline')

const ANSI = /\x1b\[[0-9;]*m/g

// Patterns search anywhere in the line — log4js prefixes each line with
// "[ts] [LEVEL] category -" before the publisher's own message.
const REQUEST_OPENAI = /\bLLM (?<label>.+?) request: model=(?<model>\S+) attempt=(?<attempt>\d+) conversationId=(?<conversationId>\S+) callId=(?<callId>\S+) messages=\d+ tools=(?<toolCount>\d+).*? systemBytes=(?<systemBytes>\d+) systemHash=(?<systemHash>\S+) bodyBytes=(?<bodyBytes>\d+) bodyHash=(?<bodyHash>\S+) toolsBytes=(?<toolsBytes>\d+) toolsHash=(?<toolsHash>\S+)/
const REQUEST_NATIVE = /\bLLM (?<label>.+?) native LM Studio request: model=(?<model>\S+) conversationId=(?<conversationId>\S+) callId=(?<callId>\S+) inputBytes=(?<bodyBytes>\d+) inputHash=(?<bodyHash>\S+) systemPromptBytes=(?<systemBytes>\d+) systemPromptHash=(?<systemHash>\S+)/
const USAGE = /\bllm\.usage (?<role>\S+) conversationId=(?<conversationId>\S+) callId=(?<callId>\S+) provider=(?<provider>\S+) model=(?<model>\S+) in=(?<in>\d+) out=(?<out>\d+) total=(?<total>\d+) cached=(?<cached>\d+) cacheWrite=(?<cacheWrite>\d+) exact=(?<exact>\S+) cacheExact=(?<cacheExact>\S+) bytes=(?<bytes>\d+) durationMs=(?<durationMs>\S+) success=(?<success>\S+)/
const TIMESTAMP = /\[(?<timestamp>\d{4}-\d{2}-\d{2}T[\d:.]+)\]/

const ROLE_FROM_LABEL = /^(?<role>orchestrator|specialist|picker|title|update\.summary)\b\s*(?<rest>.*)$/
const ROUND_FROM_LABEL = /\bround (?<round>\d+)\b/

function main(argv) {
    const args = parseArgs(argv)
    const calls = new Map()
    const order = []
    const unpairedUsages = []

    const rl = readline.createInterface({input: process.stdin, terminal: false})
    rl.on('line', line => ingest(line, {args, calls, order, unpairedUsages}))
    rl.on('close', () => emit({args, calls, order, unpairedUsages}))
}

function ingest(rawLine, {args, calls, order, unpairedUsages}) {
    const line = rawLine.replace(ANSI, '')
    const timestamp = extractTimestamp(line)
    if (args.since && timestamp && timestamp < args.since) return

    const request = matchRequest(line)
    if (request) {
        if (args.conversation && request.conversationId !== args.conversation) return
        const id = request.callId
        if (!calls.has(id)) order.push(id)
        const prior = calls.get(id) || {}
        calls.set(id, {...prior, request: {...request, timestamp}})
        return
    }

    const usage = matchUsage(line)
    if (usage) {
        if (args.conversation && usage.conversationId !== args.conversation) return
        const id = usage.callId
        const existing = calls.get(id)
        if (!existing) {
            unpairedUsages.push({...usage, timestamp})
            return
        }
        calls.set(id, {...existing, usage: {...usage, timestamp}})
    }
}

function emit({args, calls, order, unpairedUsages}) {
    const records = order.map(callId => callRecord(callId, calls.get(callId)))
    if (args.json) {
        records.forEach(record => process.stdout.write(JSON.stringify(record) + '\n'))
        if (unpairedUsages.length) emitUnpairedWarning(unpairedUsages)
        return
    }
    if (!records.length) {
        process.stderr.write('analyze-tokens: no LLM request lines parsed from stdin\n')
        if (unpairedUsages.length) emitUnpairedWarning(unpairedUsages)
        return
    }
    emitTable(records)
    if (unpairedUsages.length) emitUnpairedWarning(unpairedUsages)
}

function callRecord(callId, paired) {
    const request = paired.request || {}
    const usage = paired.usage || null
    return {
        callId,
        conversationId: request.conversationId || usage?.conversationId || null,
        timestamp: request.timestamp || null,
        label: request.label || null,
        role: roleFromLabel(request.label) || usage?.role || null,
        round: roundFromLabel(request.label),
        attempt: request.attempt ?? null,
        model: request.model || usage?.model || null,
        systemBytes: request.systemBytes ?? null,
        systemHash: request.systemHash ?? null,
        bodyBytes: request.bodyBytes ?? null,
        bodyHash: request.bodyHash ?? null,
        toolsBytes: request.toolsBytes ?? 0,
        toolsHash: request.toolsHash ?? null,
        inputTokens: usage?.in ?? null,
        outputTokens: usage?.out ?? null,
        cachedInputTokens: usage?.cached ?? null,
        durationMs: usage?.durationMs ?? null,
        success: usage?.success ?? null,
        paired: !!usage
    }
}

function emitTable(records) {
    const turns = groupIntoTurns(records)
    turns.forEach(turn => {
        process.stdout.write(turnHeader(turn) + '\n')
        process.stdout.write(rowHeader() + '\n')
        turn.calls.forEach(call => process.stdout.write(rowFor(call) + '\n'))
        process.stdout.write(turnFooter(turn) + '\n')
    })
    process.stdout.write(grandSummary(records) + '\n')
}

// Group strictly by conversation first, then partition each conversation's
// calls into turns. A turn boundary inside a conversation = the next
// orchestrator round=0 attempt=0 call; trailing title/follow-up calls stay
// in the previous turn even when they arrive interleaved with other
// conversations' calls.
function groupIntoTurns(records) {
    const byConversation = new Map()
    records.forEach(record => {
        const key = record.conversationId || '<unknown>'
        if (!byConversation.has(key)) byConversation.set(key, [])
        byConversation.get(key).push(record)
    })
    const turns = []
    byConversation.forEach((conversationCalls, conversationId) => {
        let current = null
        conversationCalls.forEach(record => {
            const startsTurn = record.role === 'orchestrator' && record.attempt === '0'
            if (startsTurn || !current) {
                current = {conversationId, startedAt: record.timestamp, calls: []}
                turns.push(current)
            }
            current.calls.push(record)
        })
    })
    return turns
}

function turnHeader(turn) {
    return `\n=== conversation=${turn.conversationId || '?'} startedAt=${turn.startedAt || '?'} (${turn.calls.length} call${turn.calls.length === 1 ? '' : 's'}) ===`
}

function rowHeader() {
    return pad('TIME', 12) + pad('ROLE', 26) + pad('R', 3) + pad('A', 3)
        + padNum('SYS', 7) + padNum('BODY', 7) + padNum('TOOLS', 7)
        + padNum('IN', 7) + padNum('OUT', 6) + padNum('CACHED', 7) + padNum('DUR_MS', 8) + ' BODY_HASH'
}

function rowFor(call) {
    const time = call.timestamp ? call.timestamp.slice(11, 19) : '?'
    const role = labelFor(call)
    return pad(time, 12)
        + pad(role, 26)
        + pad(call.round ?? '-', 3)
        + pad(call.attempt ?? '-', 3)
        + padNum(call.systemBytes ?? '?', 7)
        + padNum(call.bodyBytes ?? '?', 7)
        + padNum(call.toolsBytes ?? '?', 7)
        + padNum(call.paired ? call.inputTokens : '?', 7)
        + padNum(call.paired ? call.outputTokens : '?', 6)
        + padNum(call.paired ? call.cachedInputTokens : '?', 7)
        + padNum(call.paired ? call.durationMs : '?', 8)
        + ' ' + (call.bodyHash ?? '-')
}

function turnFooter(turn) {
    const paired = turn.calls.filter(call => call.paired)
    const sys = sumNumber(turn.calls, 'systemBytes')
    const body = sumNumber(turn.calls, 'bodyBytes')
    const tools = sumNumber(turn.calls, 'toolsBytes')
    const inTok = sumNumber(paired, 'inputTokens')
    const outTok = sumNumber(paired, 'outputTokens')
    const cached = sumNumber(paired, 'cachedInputTokens')
    const dur = sumNumber(paired, 'durationMs')
    const sysHashes = uniqueNonNull(turn.calls.map(call => call.systemHash))
    const toolsHashes = uniqueNonNull(turn.calls.map(call => call.toolsHash))
    const bodies = turn.calls.map(call => call.bodyBytes).filter(value => value != null)
    const bodyGrowth = bodies.length >= 2 ? `${bodies[0]}->${bodies[bodies.length - 1]}` : '-'
    const repeatedPrefix = estimateRepeatedPrefix(turn.calls)
    return [
        `turn totals: sys=${sys}B body=${body}B tools=${tools}B in=${inTok}tok out=${outTok}tok cached=${cached}tok dur=${dur}ms`,
        `uniqueSystemHashes=${sysHashes.length} uniqueToolsHashes=${toolsHashes.length} bodyGrowth=${bodyGrowth} repeatedPrefixBytes=${repeatedPrefix}`,
        unpairedNote(turn.calls)
    ].filter(Boolean).join('\n')
}

function grandSummary(records) {
    const paired = records.filter(record => record.paired)
    const conversations = new Set(records.map(record => record.conversationId).filter(Boolean))
    return `\n=== overall: conversations=${conversations.size} calls=${records.length} paired=${paired.length} ===`
}

function unpairedNote(calls) {
    const unpaired = calls.filter(call => !call.paired)
    if (!unpaired.length) return ''
    return `warning: ${unpaired.length} request(s) in this turn have no matching llm.usage (callId: ${unpaired.map(call => call.callId).join(', ')})`
}

function emitUnpairedWarning(unpairedUsages) {
    process.stderr.write(`analyze-tokens: ${unpairedUsages.length} llm.usage line(s) had no matching llm.request (callId: ${unpairedUsages.map(usage => usage.callId).join(', ')})\n`)
}

// If the leading (system + tools) bytes repeat across N calls in a turn,
// (N-1) * that prefix size is the input the model receives more than once.
// Prompt caching should hide most of it; the gap between this and reported
// cachedInputTokens shows where caching is leaving money on the table.
function estimateRepeatedPrefix(calls) {
    if (calls.length < 2) return 0
    const grouped = new Map()
    calls.forEach(call => {
        if (call.systemHash == null) return
        const key = `${call.systemHash}|${call.toolsHash ?? '-'}`
        const sizeOfPrefix = (call.systemBytes ?? 0) + (call.toolsBytes ?? 0)
        const prior = grouped.get(key) || {count: 0, bytes: sizeOfPrefix}
        grouped.set(key, {count: prior.count + 1, bytes: sizeOfPrefix})
    })
    let total = 0
    for (const {count, bytes} of grouped.values()) total += Math.max(0, count - 1) * bytes
    return total
}

function matchRequest(line) {
    const native = REQUEST_NATIVE.exec(line)
    if (native) {
        return {
            ...native.groups,
            attempt: '0',
            systemBytes: Number(native.groups.systemBytes),
            bodyBytes: Number(native.groups.bodyBytes),
            toolsBytes: 0,
            toolsHash: null
        }
    }
    const openai = REQUEST_OPENAI.exec(line)
    if (!openai) return null
    return {
        ...openai.groups,
        systemBytes: Number(openai.groups.systemBytes),
        bodyBytes: Number(openai.groups.bodyBytes),
        toolsBytes: Number(openai.groups.toolsBytes)
    }
}

function matchUsage(line) {
    const m = USAGE.exec(line)
    if (!m) return null
    return {
        ...m.groups,
        in: Number(m.groups.in),
        out: Number(m.groups.out),
        total: Number(m.groups.total),
        cached: Number(m.groups.cached),
        bytes: Number(m.groups.bytes),
        durationMs: m.groups.durationMs === '-' ? null : Number(m.groups.durationMs)
    }
}

function extractTimestamp(line) {
    const m = TIMESTAMP.exec(line)
    return m ? m.groups.timestamp : null
}

function roleFromLabel(label) {
    if (!label) return null
    const m = ROLE_FROM_LABEL.exec(label)
    return m ? m.groups.role : null
}

function roundFromLabel(label) {
    if (!label) return null
    const m = ROUND_FROM_LABEL.exec(label)
    return m ? m.groups.round : null
}

function labelFor(call) {
    if (!call.label) return call.role || '?'
    const stripped = call.label.replace(/\bround \d+\b/, '').replace(/\s+/g, ' ').trim()
    return stripped.length <= 25 ? stripped : stripped.slice(0, 22) + '...'
}

function sumNumber(records, field) {
    return records.reduce((total, record) => total + (typeof record[field] === 'number' ? record[field] : 0), 0)
}

function uniqueNonNull(list) {
    return [...new Set(list.filter(value => value != null))]
}

function pad(value, width) {
    const s = String(value)
    return s.length >= width ? s.slice(0, width - 1) + ' ' : s + ' '.repeat(width - s.length)
}

function padNum(value, width) {
    const s = String(value)
    return s.length >= width ? s + ' ' : ' '.repeat(width - s.length - 1) + s + ' '
}

function parseArgs(argv) {
    const args = {conversation: null, since: null, json: false}
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--conversation') args.conversation = argv[++i]
        else if (arg === '--since') args.since = argv[++i]
        else if (arg === '--json') args.json = true
        else if (arg === '--help' || arg === '-h') { printHelp(); process.exit(0) }
        else { process.stderr.write(`analyze-tokens: unknown arg ${arg}\n`); process.exit(2) }
    }
    return args
}

function printHelp() {
    process.stdout.write(`Usage: docker logs ai 2>&1 | analyze-tokens.js [options]

Options:
  --conversation <id>   only include this conversation
  --since <iso>         drop lines with timestamps before this
  --json                emit one JSON object per call (no table)
  -h, --help            this help
`)
}

main(process.argv)
