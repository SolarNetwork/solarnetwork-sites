/**
 * @require d3 3.0
 * @require CryptoJS 3.0
 * @require solarnetwork-d3-datum 1.0.0
 */
(function() {
'use strict';

var userUrlHelperFunctions;

if ( sn.user === undefined ) {
	/**
	 * @namespace the SolarNetwork user namespace.
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

/**
 * An active user-specific URL utility object. This object does not require
 * any specific user ID to be configured, as all requests are assumed to apply
 * to the active user credentials.
 * 
 * @class
 * @constructor
 * @param {Object} configuration The configuration options to use.
 * @returns {sn.user.userUrlHelper}
 */
sn.user.userUrlHelper = function(configuration) {
	var self = {
		version : '1.0.0'
	};
	
	var config = sn.util.copy(configuration, {
		host : 'data.solarnetwork.net',
		tls : true,
		path : '/solaruser',
		secureQuery : true
	});
	
	/**
	 * Get a URL for just the SolarNet host, without any path.
	 *
	 * @returns {String} the URL to the SolarNet host
	 * @memberOf sn.datum.nodeUrlHelper
	 */
	function hostURL() {
		return ('http' +(config.tls === true ? 's' : '') +'://' +config.host);
	}
	
	/**
	 * Get a URL for the SolarNet host and the base API path, e.g. <code>/solaruser/api/v1/sec</code>.
	 *
	 * @returns {String} the URL to the SolarUser base API path
	 * @memberOf sn.user.userUrlHelper
	 */
	function baseURL() {
		return (hostURL() +config.path +'/api/v1/' +(config.secureQuery === true ? 'sec' : 'pub'));
	}
	
	/**
	 * Get a description of this helper object.
	 *
	 * @return {String} The description of this object.
	 * @memberOf sn.user.userUrlHelper
	 */
	function keyDescription() {
		return 'user';
	}
	
	/**
	 * Generate a SolarUser {@code /nodes} URL.
	 * 
	 * @return {String} the URL to access the active user's nodes
	 * @memberOf sn.user.userUrlHelper
	 */
	function viewNodesURL(sourceIds) {
		var url = (baseURL() + '/nodes');
		return url;
	}
	
	// setup core properties
	Object.defineProperties(self, {
		keyDescription			: { value : keyDescription },
		hostURL					: { value : hostURL },
		baseURL					: { value : baseURL },
		viewNodesURL 			: { value : viewNodesURL }
	});
	
	// allow plug-ins to supply URL helper methods, as long as they don't override built-in ones
	(function() {
		if ( Array.isArray(userUrlHelperFunctions) ) {
			userUrlHelperFunctions.forEach(function(helper) {
				if ( self.hasOwnProperty(helper.name) === false ) {
					Object.defineProperty(self, helper.name, { value : function() {
						return helper.func.apply(self, arguments);
					} });
				}
			});
		}
	}());

	return self;
};

/**
 * Register a custom function to generate URLs with {@link sn.user.userUrlHelper}.
 * 
 * @param {String} name The name to give the custom function. By convention the function
 *                      names should end with 'URL'.
 * @param {Function} func The function to add to sn.user.userUrlHelper instances.
 */
sn.user.registerUserUrlHelperFunction = function(name, func) {
	if ( typeof func !== 'function' ) {
		return;
	}
	if ( userUrlHelperFunctions === undefined ) {
		userUrlHelperFunctions = [];
	}
	name = name.replace(/[^0-9a-zA-Z_]/, '');
	userUrlHelperFunctions.push({name : name, func : func});
};

}());
