export const simplifyString = s => s
    ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    : ''
