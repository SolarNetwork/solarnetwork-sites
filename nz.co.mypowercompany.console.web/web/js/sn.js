var SNAPI = {};

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
SNAPI.generateAuthorizationHeaderValue = function(params) {
	var msg = 
		(params.method === undefined ? 'GET' : params.method.toUpperCase()) + '\n\n'
		+(params.data === undefined ? '' : 'application/x-www-form-urlencoded; charset=UTF-8') + '\n'
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
SNAPI.parseURLQueryTerms = function(search) {
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
SNAPI.authURLPath = function(url, data) {
	var a = document.createElement('a');
	a.href = url;
	var path = a.pathname;
	
	// handle query params, which must be sorted
	var params = SNAPI.parseURLQueryTerms(data === undefined ? a.search : data);
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
 * header values needed to invoke the web service, the invoke it and call the provided
 * callback function on success. The callback function is passed to the jQuery 
 * <code>done()</code> function, so accepts the same parameters as that function.</p> 
 * 
 * @param {String} url the web service URL to invoke
 * @param {Function} callback the function to call on success
 */
SNAPI.requestJSON = function(url, method, data) {
	method = (method === undefined ? 'GET' : method);
	var ajax = $.ajax({
		type: method,
		url: url,
		dataType: 'json',
		data: data,
		beforeSend: function(xhr) {
			// get a date, which we must include as a header as well as include in the 
			// generated authorization hash
			var date = new Date().toUTCString();		
			
			// construct our canonicalized path value from our URL
			var path = SNAPI.authURLPath(url, data);
			
			// generate the authorization hash value now (cryptographically signing our request)
			var auth = SNAPI.generateAuthorizationHeaderValue({
				method: method,
				date: date,
				path: path,
				token: SNAPI.ajaxCredentials.token,
				secret: SNAPI.ajaxCredentials.secret,
				data: data
			});
			
			// set the headers on our request
			xhr.setRequestHeader('X-SN-Date', date);
			xhr.setRequestHeader('Authorization', 'SolarNetworkWS ' +auth);
		}
	});
	return ajax;
	/*
	.done(callback).fail(function(xhr, status, reason) {
		alert(reason + ': ' +status +' (' +xhr.status +')');
	});
	*/
};
