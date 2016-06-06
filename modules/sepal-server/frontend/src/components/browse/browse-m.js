/**
 * @author Mino Togna
 */

var dirs = {}

//{ 0 : {path :'/' , children:[] } }

var setLevel = function ( level, path, children ) {
    var i = Object.keys( dirs ).length - 1
    while ( i >= level ) {
        delete dirs[ i ]
        i--
    }

    var absPath = absolutePath( level -1 , path )
    dirs[ level ] = { level: level, path: path, children: children , absPath: absPath}
}

var getLevel = function ( level ) {
    return dirs[ level ]
}

var absolutePath = function ( parentLevel, name ) {

    var path = name
    if ( parentLevel >=0 ) {
        // path = dirs[ parentLevel ].absPath
        path = dirs[ parentLevel ].absPath + name +'/'
    }

    return path
}

module.exports = {
    absolutePath: absolutePath
    , setLevel  : setLevel
    , getLevel  : getLevel
}