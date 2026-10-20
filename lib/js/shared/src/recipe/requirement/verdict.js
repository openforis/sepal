// What a requirement concludes about a source from the facts it was given (requirement/*.js):
//
//   SUPPORTED       the facts establish that the source meets it
//   UNSUPPORTED     they establish that it does not, or fail to establish what it needs: `diagnostic.code` says which
//   NEEDS_EVIDENCE  there are no facts to judge from
//
// Whether facts can be trusted - read for this source, current, authorized - is the caller's to decide before asking.

export const SUPPORTED = 'SUPPORTED'
export const UNSUPPORTED = 'UNSUPPORTED'
export const NEEDS_EVIDENCE = 'NEEDS_EVIDENCE'

export const unsupported = diagnostic => ({status: UNSUPPORTED, diagnostic})
