// ASCII fallback plus the RFC 5987 UTF-8 form, so quotes and non-Latin-1 names cannot break the header.
export const contentDisposition = name => {
    const fallback = name.replace(/["\\]|[^\x20-\x7e]/g, '_')
    const encoded = encodeURIComponent(name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}
