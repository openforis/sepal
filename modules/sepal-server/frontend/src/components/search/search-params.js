/**
 * @author Mino Togna
 */

this.countryIso = null
this.polygon           = null
this.targetDate        = null
this.offsetToTargetDay = null
this.sortWeight        = null
this.landsatSensors    = null
this.sentinel2Sensors  = null
this.minScenes         = null
this.maxScenes         = null

this.reset = function () {
    this.countryIso        = null
    this.polygon           = null
    this.targetDate        = null
    //
    this.offsetToTargetDay = 0
    this.sortWeight        = 0.5
    this.landsatSensors    = Object.keys( require( '../sensors/landsat-sensors' ) )
    this.sentinel2Sensors  = []//Object.keys( require( '../sensors/sentinel2-sensors' ) )
    this.minScenes         = 1
}

this.hasValidAoi = function () {
    return !( $.isEmptyString( this.countryIso ) && $.isEmptyString( this.polygon ) )
}

this.addAoiRequestParameter = function ( data ) {
    if ( data ) {
        
        if ( $.isNotEmptyString( this.polygon ) ) {
            data.polygon = this.polygon
        } else if ( $.isNotEmptyString( this.countryIso ) ) {
            data.countryIso = this.countryIso
        }
        
    }
}

this.addDatesRequestParameters = function ( data ) {
    var DATE_FORMAT = "YYYY-MM-DD"
    var date        = this.targetDate.asMoment()
    
    if ( this.offsetToTargetDay == 0 ) {
        data.fromDate = date.clone().month( 0 ).date( 1 ).format( DATE_FORMAT )
        data.toDate   = date.clone().month( 11 ).date( 31 ).format( DATE_FORMAT )
    } else {
        data.fromDate = date.clone().subtract( this.offsetToTargetDay / 2, 'years' ).format( DATE_FORMAT )
        data.toDate   = date.clone().add( this.offsetToTargetDay / 2, 'years' ).format( DATE_FORMAT )
    }
    
    this.addTargetDayOfYearRequestParameter( data )
}

this.addTargetDayOfYearRequestParameter = function ( data ) {
    var date             = this.targetDate.asMoment()
    data.targetDayOfYear = date.format( "DDD" )
}

this.isSensorSelected = function ( dataSet , sensor ) {
    var sensors = null
    if( dataSet == this.SENSORS.LANDSAT )
        sensors = this.landsatSensors
    else if( dataSet == this.SENSORS.SENTINEL2 )
        sensors = this.sentinel2Sensors
    
    return sensors && sensors.indexOf( sensor ) < 0
}

this.SENSORS = {
    LANDSAT    : 'LANDSAT'
    , SENTINEL2: 'SENTINEL2'
}

module.exports = this
