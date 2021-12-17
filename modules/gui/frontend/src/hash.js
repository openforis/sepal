export const simplehash = object => {
    const string = JSON.stringify(object)
    for(var i = 0, h = 0xdeadbeef; i < string.length; i++)
        h = Math.imul(h ^ string.charCodeAt(i), 2654435761)
    return (h ^ (h >>> 16)) >>> 0
}
