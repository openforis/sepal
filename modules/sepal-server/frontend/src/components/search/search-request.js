/**
 * Created by Mino Togna on 4/28/16.
 */

var SearchRequest = function () {

    this.countryCode = ''

    this.fromYear  = -1
    this.fromMonth = -1
    this.fromDay   = -1

    this.toYear  = -1
    this.toMonth = -1
    this.toDay   = -1

    this.targetDayMonth = -1
    this.targetDayDay   = -1
}

var _instance = new SearchRequest()

module.exports = _instance