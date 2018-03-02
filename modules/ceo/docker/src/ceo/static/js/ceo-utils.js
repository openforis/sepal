$.urlParam = function(name) {
    var results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
    return results[1] || 0;
};

$.dayOfYear = function(date) {
    var timestmp = new Date(date).setFullYear(new Date(date).getFullYear(), 0, 1);
    var yearFirstDay = Math.floor(timestmp / 86400000);
    var today = Math.ceil((new Date(date).getTime()) / 86400000);
    var dayOfYear = today - yearFirstDay;
    return dayOfYear;
};

function S4() {
    return (((1+Math.random())*0x10000)|0).toString(16).substring(1); 
}

function generateGUID() {
    return (S4() + S4() + "-" + S4() + "-4" + S4().substr(0,3) + "-" + S4() + "-" + S4() + S4() + S4()).toLowerCase();
}
