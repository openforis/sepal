/**
 * @author Mino Togna
 */

var countryIso = null
var polygon    = null
var targetDate = null

var init = function () {
    countryIso = null
    polygon    = null
    targetDate = null
}

var getCountryIso = function () {
    return countryIso
}

var setCountryIso = function ( c ) {
    countryIso = c
    polygon    = null
}

var getPolygon = function () {
    return polygon
}

var setPolygon = function ( p ) {
    polygon    = p
    countryIso = null
}

var getTargetDate = function () {
    return targetDate
}

var setTargetDate = function ( d ) {
    targetDate = d
}

var hasValidAoi = function () {
    return !( $.isEmptyString( countryIso ) && $.isEmptyString( polygon ) )
}

var addAoiRequestParameter = function ( data ) {
    if ( data ) {
        
        if ( $.isNotEmptyString( polygon ) ) {
            data.polygon = polygon
        } else if ( $.isNotEmptyString( countryIso ) ) {
            data.countryIso = countryIso
        }
        
    }
}

module.exports = {
    init                    : init
    , getCountryIso         : getCountryIso
    , setCountryIso         : setCountryIso
    , getPolygon            : getPolygon
    , setPolygon            : setPolygon
    , getTargetDate         : getTargetDate
    , setTargetDate         : setTargetDate
    , hasValidAoi           : hasValidAoi
    , addAoiRequestParameter: addAoiRequestParameter
}