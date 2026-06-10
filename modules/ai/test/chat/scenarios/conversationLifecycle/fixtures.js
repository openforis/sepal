const T1 = 1700000000000
const T2 = T1 + 60000
const ISO_T1 = new Date(T1).toISOString()
const ISO_T2 = new Date(T2).toISOString()

export {ISO_T1, ISO_T2, T1, T2}
