/**
 * @require d3 3.0
 * @require CryptoJS 3.0
 * @require solarnetwork-d3-datum 1.0.0
 */
(function() {
'use strict';

if ( sn.user === undefined ) {
	/**
	 * @namespace the SolarNetwork security namespace.
	 */
	sn.user = {
		version : '1.0.0'
	};
}

function solarUserBaseURL(urlHelper) {
	return (urlHelper.hostURL() 
		+(sn.config && sn.config.solarUserPath ? sn.config.solarUserPath : '/solaruser')
		+'/api/v1/sec');
}

sn.datum.registerNodeUrlHelperFunction('viewActiveInstructionsURL', function() {
	return (solarUserBaseURL(this) +'/instr/viewActive?nodeId=' +this.nodeId);
});

sn.datum.registerNodeUrlHelperFunction('viewPendingInstructionsURL', function() {
	return (solarUserBaseURL(this) +'/instr/viewPending?nodeId=' +this.nodeId);
});

sn.datum.registerNodeUrlHelperFunction('updateInstructionStateURL', function(instructionID, state) {
	return (solarUserBaseURL(this) 
		+'/instr/updateState?id=' +encodeURIComponent(instructionID)
		+'&state=' +encodeURIComponent(state));
});

// parameters is an array of {name:n1, value:v1} objects
sn.datum.registerNodeUrlHelperFunction('queueInstructionURL', function(topic, parameters) {
	var url = (solarUserBaseURL(this) 
		+'/instr/add?nodeId=' +this.nodeId
		+'&topic=' +encodeURIComponent(topic));
	if ( Array.isArray(parameters) ) {
		var i, len;
		for ( i = 0, len = parameters.length; i < len; i++ ) {
			url += '&' +encodeURIComponent('parameters['+i+'].name') +'=' +encodeURIComponent(parameters[i].name)
				+ '&' +encodeURIComponent('parameters['+i+'].value') +'=' +encodeURIComponent(parameters[i].value);
		}
	}
	return url;
});

}());
