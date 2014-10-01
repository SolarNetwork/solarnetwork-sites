/**
 * @require d3 3.0
 * @require CryptoJS 3.0
 */
(function() {
'use strict';

if ( sn.sec === undefined ) {
	/**
	 * @namespace the SolarNetwork security namespace.
	 */
	sn.sec = {
		version : '1.1.0'
	};
}

// security runtime environment
sn.sec.env = {
	// our in-memory credentials
	cred : {token: undefined, secret: undefined}
};

sn.sec.solarUserBaseURL = function(urlHelper) {
	return (urlHelper.hostURL() +sn.config.solarUserPath +'/api/v1/sec');
};

sn.datum.registerNodeUrlHelperFunction('viewActiveInstructionsURL', function() {
	return (sn.sec.solarUserBaseURL(this) +'/instr/viewActive?nodeId=' +this.nodeId);
});

sn.datum.registerNodeUrlHelperFunction('updateInstructionStateURL', function(instructionID, state) {
	return (sn.sec.solarUserBaseURL(this) 
		+'/instr/updateState?id=' +encodeURIComponent(instructionID)
		+'&state=' +encodeURIComponent(state));
});

// parameters is an array of {name:n1, value:v1} objects
sn.datum.registerNodeUrlHelperFunction('queueInstructionURL', function(topic, parameters) {
	var url = (sn.sec.solarUserBaseURL(this) 
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
 * Generate the authorization header value for a set of request parameters.
 * 
 * <p>This returns just the authorization header value, without the scheme. For 
 * example this might return a value like 
 * <code>a09sjds09wu9wjsd9uya:6U2NcYHz8jaYhPd5Xr07KmfZbnw=</code>. To use
 * as a valid <code>Authorization</code> header, you must still prefix the
 * returned value with <code>SolarNetworkWS</code> (with a space between
 * that prefix and the associated value).</p>
 * 
 * <p>Note that the <b>Content-MD5</b> and <b>Content-Type</b> headers are <b>not</b>
 * supported.</p>
 * 
 * @param {Object} params the request parameters
 * @param {String} params.method the HTTP request method
 * @param {String} params.date the formatted HTTP request date
 * @param {String} params.path the SolarNetworkWS canonicalized path value
 * @param {String} params.token the authentication token
 * @param {String} params.secret the authentication token secret
 * @return {String} the authorization header value
 */
sn.sec.generateAuthorizationHeaderValue = function(params) {
	var msg = 
		(params.method === undefined ? 'GET' : params.method.toUpperCase()) + '\n\n'
		+(params.contentType === undefined ? '' : params.contentType) + '\n'
		+params.date +'\n'
		+params.path;
	var hash = CryptoJS.HmacSHA1(msg, params.secret);
	var authHeader = params.token +':' +CryptoJS.enc.Base64.stringify(hash);
	return authHeader;
};

/**
 * Parse the query portion of a URL string, and return a parameter object for the
 * parsed key/value pairs.
 * 
 * <p>Multiple parameters of the same name are <b>not</b> supported.</p>
 * 
 * @param {String} search the query portion of the URL, which may optionally include 
 *                        the leading '?' character
 * @return {Object} the parsed query parameters, as a parameter object
 */
sn.sec.parseURLQueryTerms = function(search) {
	var params = {};
	var pairs;
	var pair;
	var i, len;
	if ( search !== undefined && search.length > 0 ) {
		// remove any leading ? character
		if ( search.match(/^\?/) ) {
			search = search.substring(1);
		}
		pairs = search.split('&');
		for ( i = 0, len = pairs.length; i < len; i++ ) {
			pair = pairs[i].split('=', 2);
			if ( pair.length === 2 ) {
				params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
			}
		}
	}
	return params;
};

/**
 * Generate the SolarNetworkWS path required by the authorization header value.
 * 
 * <p>This method will parse the given URL and then apply the path canonicalization
 * rules defined by the SolarNetworkWS scheme.</p>
 * 
 * @param {String} url the request URL
 * @return {String} path the canonicalized path value to use in the SolarNetworkWS 
 *                       authorization header value
 */
sn.sec.authURLPath = function(url, data) {
	var a = document.createElement('a');
	a.href = url;
	var path = a.pathname;
	
	// handle query params, which must be sorted
	var params = sn.sec.parseURLQueryTerms(data === undefined ? a.search : data);
	var sortedKeys = [], key = undefined;
	var i, len;
	var first = true;

	for ( key in params ) {
		sortedKeys.push(key);
	}
	sortedKeys.sort();
	if ( sortedKeys.length > 0 ) {
		path += '?';
		for ( i = 0, len = sortedKeys.length; i < len; i++ ) {
			if ( first ) {
				first = false;
			} else {
				path += '&';
			}
			path +=  sortedKeys[i];
			path += '=';
			path += params[sortedKeys[i]];
		}
	}
	return path;
};

/**
 * Invoke the web service URL, adding the required SolarNetworkWS authorization
 * headers to the request.
 * 
 * <p>This method will construct the <code>X-SN-Date</code> and <code>Authorization</code>
 * header values needed to invoke the web service. It returns a d3 XHR object,
 * so you can call <code>.on()</code> on that to handle the response, unless a callback
 * parameter is specified, then the request is issued immediately.</p>
 * 
 * @param {String} url the web service URL to invoke
 * @param {String} method the HTTP method to use; e.g. GET or POST
 * @param {Function} callback if defined, a d3 callback function to handle the response JSON with
 * @return {Object} d3 XHR object
 */
sn.sec.json = function(url, method, callback) {
	method = (method === undefined ? 'GET' : method.toUpperCase());
	var requestUrl = url;
	var sendData = undefined;
	var contentType = undefined;
	var queryIndex = undefined;
	if ( method === 'POST' ) {
		// extract any URL request parameters and put into POST body
		queryIndex = url.indexOf('?');
		if ( queryIndex !== -1 ) {
			if ( queryIndex + 1 < url.length - 1 ) {
				sendData = url.substring(queryIndex + 1);
			}
			requestUrl = url.substring(0, queryIndex);
			contentType = 'application/x-www-form-urlencoded; charset=UTF-8';
		}
	}
	var xhr = d3.json(requestUrl);
	if ( contentType !== undefined ) {
		xhr.header('Content-Type', contentType);
	}
	xhr.on('beforesend', function(request) {
		// get a date, which we must include as a header as well as include in the 
		// generated authorization hash
		var date = new Date().toUTCString();		
		
		// construct our canonicalized path value from our URL
		var path = sn.sec.authURLPath(url, sendData);
		
		// generate the authorization hash value now (cryptographically signing our request)
		var auth = sn.sec.generateAuthorizationHeaderValue({
			method: method,
			date: date,
			path: path,
			token: sn.sec.env.cred.token,
			secret: sn.sec.env.cred.secret,
			contentType: contentType
		});
		
		// set the headers on our request
		request.setRequestHeader('X-SN-Date', date);
		request.setRequestHeader('Authorization', 'SolarNetworkWS ' +auth);
	});
	
	// register a load handler always, just so one is present
	xhr.on('load.internal', function() {
		//sn.log('URL {0} response received.', url);
	});
	
	if ( callback !== undefined ) {
		xhr.send(method, sendData, callback);
	}
	return xhr;
};

}());
