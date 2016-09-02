/**
 * @author Mino Togna
 */

this.countryIso = null
this.polygon           = null
this.targetDate        = null
this.offsetToTargetDay = null
this.sortWeight        = null
this.sensors           = null

this.reset = function () {
    this.countryIso        = null
    this.polygon           = null
    this.targetDate        = null
    //
    this.offsetToTargetDay = 1
    this.sortWeight        = 0.5
    this.sensors           = Object.keys( require( '../sensors/sensors' ) )
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

this.isSensorSelected = function ( sensor ) {
    return this.sensors && this.sensors.indexOf( sensor ) < 0
}


module.exports = this
