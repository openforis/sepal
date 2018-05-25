export const arrayEquals = (a1, a2) => {
    if (a1 === a2) return true
    if ((a1 && a1.length || 0) !== (a2 && a2.length) || 0) return false
    if (a1 && !a2 || a2 && !a1) return false
    return !a1.find((e, i) => e !== a2[i]);

}

export const intersect = (array) => Array.from(new Set(array))
