/**
 * @require d3 3.0
 * @require queue 1.0
 */
(function() {
'use strict';

if ( sn === undefined ) {
	sn = {};
}

/**
 * @namespace the SolarNetwork Datum namespace
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.5
 */
sn.datum = {};

/**
 * A node-specific URL utility object.
 * 
 * @class
 * @constructor
 * @param {Number} nodeId The node ID to use.
 * @param {Object} configuration The configuration options to use.
 * @returns {sn.datum.nodeUrlHelper}
 */
sn.datum.nodeUrlHelper = function(nodeId, configuration) {
	var that = {
		version : '1.0.0'
	};
	
	var config = (configuration || {
		host : 'data.solarnetwork.net',
		tls : true,
		path : '/solarquery',
		secureQuery : false
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
	 * Get a URL for the SolarNet host and the base API path, e.g. <code>/solarquery/api/v1/sec</code>.
	 *
	 * @returns {String} the URL to the SolarNet base API path
	 * @memberOf sn.datum.nodeUrlHelper
	 */
	function baseURL() {
		return (hostURL() +config.path +'/api/v1/' +(config.secureQuery === true ? 'sec' : 'pub'));
	}
	
	/**
	 * Get a URL for the "reportable interval" for this node, optionally limited to a specific source ID.
	 *
	 * @param {Array} sourceIds An array of source IDs to limit query to. If not provided then all available 
	 *                sources will be returned.
	 * @returns {String} the URL to find the reportable interval
	 * @memberOf sn.datum.nodeUrlHelper
	 */
	function reportableIntervalURL(sourceIds) {
		var url = (baseURL() +'/range/interval?nodeId=' +nodeId);
		if ( Array.isArray(sourceIds) ) {
			url += '&' + sourceIds.map(function(e) { return 'sourceIds='+encodeURIComponent(e); }).join('&')
		}
		return url;
	}
	
	/**
	 * Get a available source IDs for this node, optionally limited to a date range.
	 *
	 * @param {Date} startDate An optional start date to limit the results to.
	 * @param {Date} endDate An optional end date to limit the results to.
	 * @returns {String} the URL to find the available source
	 * @memberOf sn.datum.nodeUrlHelper
	 */
	function availableSourcesURL(startDate, endDate) {
		var url = (baseURL() +'/range/sources?nodeId=' +nodeId);
		if ( startDate !== undefined ) {
			url += '&start=' +encodeURIComponent(sn.dateFormat(startDate));
		}
		if ( endDate !== undefined ) {
			url += '&end=' +encodeURIComponent(sn.dateFormat(endDate));
		}
		return url;
	}
	
	/**
	 * Generate a SolarNet {@code /datum/query} URL.
	 * 
	 * @param {String} type a single supported datum type, or an Array of datum types, to query for
	 * @param {Date} startDate the starting date for the query, or <em>null</em> to omit
	 * @param {Date} endDate the ending date for the query, or <em>null</em> to omit
	 * @param {String|Number} agg a supported aggregate type (e.g. Hour, Day, etc) or a minute precision Number
	 * @param {Array} sourceIds array of source IDs to limit query to
	 * @return {String} the URL to perform the query with
	 * @memberOf sn.datum.nodeUrlHelper
	 */
	function dateTimeQueryURL(startDate, endDate, agg, sourceIds) {
		var url = (baseURL() +'/datum/query?nodeId=' +nodeId),
			aggNum = Number(agg);
		if ( startDate ) {
			url += '&startDate=' +encodeURIComponent(sn.dateTimeFormatURL(startDate));
		}
		if ( endDate ) {
			url += '&endDate=' +encodeURIComponent(sn.dateTimeFormatURL((function() {
				return (opts !== undefined && opts.exclusiveEndDate === true ? d3.time.second.utc.offset(endDate, -1) : endDate);
			}())));
		}
		if ( !isNaN(aggNum) ) {
			url += '&precision=' +aggNum.toFixed(0);
		} else if ( typeof agg === 'string' && agg.length > 0 ) {
			url += '&aggregate=' + encodeURIComponent(agg);
		}
		if ( Array.isArray(sourceIds) ) {
			url += '&' + sourceIds.map(function(e) { return 'sourceIds='+encodeURIComponent(e); }).join('&')
		}
		return url;
	}
		
	/**
	 * Generate a SolarNet {@code /datum/list} URL.
	 * 
	 * @param {Date} startDate The starting date for the query, or <em>null</em> to omit
	 * @param {Date} endDate The ending date for the query, or <em>null</em> to omit
	 * @param {String|Number} agg A supported aggregate type (e.g. Hour, Day, etc) or a minute precision Number
	 * @param {Array} sourceIds Array of source IDs to limit query to
	 * @param {Object} pagination An optional pagination object, with <code>offset</code> and <code>max</code> properties.
	 * @return {String} the URL to perform the list with
	 * @memberOf sn.datum.nodeUrlHelper
	 */
	function dateTimeListURL(startDate, endDate, agg, sourceIds, pagination) {
		var url = (baseURL() +'/datum/list?nodeId=' +nodeId),
			aggNum = Number(agg);
		if ( startDate ) {
			url += '&startDate=' +encodeURIComponent(sn.dateTimeFormatURL(startDate));
		}
		if ( eDate ) {
			url += '&endDate=' +encodeURIComponent(sn.dateTimeFormatURL(eDate));
		}
		if ( !isNaN(aggNum) ) {
			url += '&precision=' +aggNum.toFixed(0);
		} else if ( typeof agg === 'string' && agg.length > 0 ) {
			url += '&aggregate=' + encodeURIComponent(agg);
		}
		if ( Array.isArray(sourceIds) ) {
			url += '&' + sourceIds.map(function(e) { return 'sourceIds='+encodeURIComponent(e); }).join('&')
		}
		if ( pagination !== undefined ) {
			if ( pagination.max > 0 ) {
				url += '&max=' + encodeURIComponent(pagination.max);
			}
			if ( pagination.offset > 0 ) {
				url += '&offset=' + encodeURIComponent(pagination.offset);
			}
		}
		return dataURL;
	}
		
	/**
	 * Generate a SolarNet {@code /datum/mostRecent} URL.
	 * 
	 * @param {Array} sourceIds Array of source IDs to limit query to
	 * @return {String} the URL to perform the most recent query with
	 * @memberOf sn.datum.nodeUrlHelper
	 */
	function mostRecentURL(sourceIds) {
		var url = (baseURL() + '/datum/mostRecent?nodeId=' + nodeId);
		url += nodeId;
		if ( Array.isArray(sourceIds) ) {
			url += '&' + sourceIds.map(function(e) { return 'sourceIds='+encodeURIComponent(e); }).join('&')
		}
		return url;
	}
		
	Object.defineProperties(that, {
		nodeId					: { value : nodeId },
		hostURL					: { value : hostURL },
		baseURL					: { value : baseURL },
		reportableIntervalURL 	: { value : reportableIntervalURL },
		availableSourcesURL		: { value : availableSourcesURL },
		dateTimeQueryURL		: { value : dateTimeQueryURL },
		dateTimeListURL			: { value : dateTimeListURL },
		mostRecentURL			: { value : mostRecentURL }
	});
	return that;
};


/**
 * Call the {@code /range/interval} web service for a set of source IDs and
 * invoke a callback function with the results.
 * 
 * <p>The callback function will be passed the same 'data' object returned
 * by the {@code /range/interval} endpoint, but the start/end dates will be
 * a combination of the earliest available and latest available results for
 * every different node ID provided.
 * 
 * @param {Array} sourceSets An array of objects, each with a {@code sourceIds} array 
 *                property and a {@code nodeUrlHelper} {@code sn.datum.nodeUrlHelper}
 *                propery.
 * @param {Function} [callback] A callback function which will be passed the result object.
 */
sn.datum.availableDataRange = function(sourceSets, callback) {
	var q = queue();
	
	// submit all queries to our queue
	(function() {
		var i,
			url;
		for ( i = 0; i < sourceSets.length; i += 1 ) {
			url = sourceSets[i].nodeUrlHelper.reportableIntervalURL(sourceSets[i].sourceIds);
			q.defer(d3.json, url);
		}
	}());
	
	function extractReportableInterval(results) {
		var result, 
			i = 0,
			repInterval;
		for ( i = 0; i < results.length; i += 1 ) {
			repInterval = results[i];
			if ( repInterval.data === undefined || repInterval.data.endDate === undefined ) {
				sn.log('No data available for node {0} sources {1}', 
					sourceSets[i].nodeUrlHelper.nodeId, sourceSets[i].sourceIds.join(','));
				continue;
			}
			repInterval = repInterval.data;
			if ( result === undefined ) {
				result = repInterval;
			} else {
				// merge start/end dates
				// note we don't copy the time zone... this breaks when the tz are different!
				if ( repInterval.endDateMillis > result.endDateMillis ) {
					result.endDateMillis = repInterval.endDateMillis;
					result.endDate = repInterval.endDate;
				}
				if ( repInterval.startDateMillis < result.startDateMillis ) {
					result.startDateMillis = repInterval.startDateMillis;
					result.startDate = repInterval.startDate;
				}
			}
		}
		return result;
	}
	
	q.awaitAll(function(error, results) {
		if ( error ) {
			sn.log('Error requesting available data range: ' +error);
			return;
		}
		var intervalObj = extractReportableInterval(results);
		if ( intervalObj.startDateMillis !== undefined ) {
			intervalObj.sDate = new Date(intervalObj.startDateMillis);
			//intervalObj.sLocalDate = sn.dateTimeFormatLocal.parse(intervalObj.startDate);
		}
		if ( intervalObj.endDateMillis !== undefined ) {
			intervalObj.eDate = new Date(intervalObj.endDateMillis);
		}

		if ( typeof callback === 'function' ) {
			callback(intervalObj);
		}
	});
};

/**
 * Load data for a set of source IDs, date range, and aggregate level. This object is designed 
 * to be used once per query. After creating the object and configuring an asynchronous
 * callback function with {@link #callback(function)}, call call {@link #load()} to start
 * loading the data. The callback function will be called once all data has been loaded.
 * 
 * @class
 * @param {string[]} sourceIds - array of source IDs to load data for
 * @param {function} urlHelper - a {@link sn.nodeUrlHelper}
 * @param {date} start - the start date, or {@code null}
 * @param {date} end - the end date, or {@code null}
 * @param {string} aggregate - aggregate level
 * @returns {sn.datumLoader}
 */
sn.datum.loader = function(sourceIds, urlHelper, start, end, aggregate) {
	
	var that = {
			version : '1.0.0'
	};

	var requestOptions;
	var finishedCallback;
	var holeRemoverCallback;

	var state = 0; // keys are source IDs, values are 1:loading, 2:done
	var results;
	
	function aggregateValue() {
		return (aggregate === undefined ? 'Hour'  : aggregate);
	}
	
	function precisionValue() {
		return (precision === undefined ? 10 : precision);
	}
	
	function requestCompletionHandler() {
		state = 2; // done
		
		// check if we're all done loading, and if so call our callback function
		if ( finishedCallback ) {
			finishedCallback.call(that, results);
		}
	}

	function loadData(offset) {
		var opts = {},
			key,
			url,
			dataExtractor,
			offsetExtractor;
		if ( requestOptions ) {
			for ( key in requestOptions ) {
				if ( requestOptions.hasOwnProperty(key) ) {
					opts[key] = requestOptions[key];
				}
			}
		}
		opts.sourceIds = sourceIds;
		if ( offset ) {
			opts.offset = offset;
		}
		if ( aggregateValue() === 'Minute' ) {
			// use /query to normalize minutes; end date is inclusive
			url = urlHelper.dateTimeQuery(null, start, end, precisionValue(), opts);
			dataExtractor = function(json) {
				if ( json.success !== true || Array.isArray(json.data) !== true ) {
					return undefined;
				}
				var result = json.data;
				if ( holeRemoverCallback ) {
					result = holeRemoverCallback.call(that, result);
				}
				return result;
			};
			offsetExtractor = function() { return 0; };
		} else {
			// use /list for faster access; end date is exclusive
			url = urlHelper.dateTimeList(null, start, end, aggregateValue(), opts);
			dataExtractor = function(json) {
				if ( json.success !== true || json.data === undefined || Array.isArray(json.data.results) !== true ) {
					return undefined;
				}
				return json.data.results;
			};
			offsetExtractor = function(json) { 
				return (json.data.returnedResultCount + json.data.startingOffset < json.data.totalResults 
						? (json.data.returnedResultCount + json.data.startingOffset)
						: 0);
			};
		}
		d3.json(url, function(error, json) {
			var dataArray,
				nextOffset;
			if ( error ) {
				sn.log('Error requesting data for node {0}: {2}', urlHelper.nodeId(), error);
				return;
			}
			dataArray = dataExtractor(json);
			if ( dataArray === undefined ) {
				sn.log('No data available for node {0}', urlHelper.nodeId());
				requestCompletionHandler();
				return;
			}

			if ( results === undefined ) {
				results = dataArray;
			} else {
				results = results.concat(dataArray);
			}
			
			// see if we need to load more results
			nextOffset = offsetExtractor(json);
			if ( nextOffset > 0 ) {
				loadData(nextOffset);
			} else {
				requestCompletionHandler();
			}
		});
	}
	
	/**
	 * Get or set the request options object.
	 * 
	 * @param {object} [value] the options to use
	 * @return when used as a getter, the current request options, otherwise this object
	 * @memberOf sn.datumLoader
	 */
	that.requestOptions = function(value) {
		if ( !arguments.length ) { return requestOptions; }
		requestOptions = value;
		return that;
	};

	/**
	 * Get or set the "hole remover" callback function, invoked on data that has been loaded
	 * via the /query API, which "fills" in holes for us. For consistency with the /list API,
	 * we can choose to remove those filled in data points, which can often adversely affect
	 * our desired results.
	 *
	 * The function will be passed a raw array of datum objects as its only parameter. It should
	 * return a new array of datum objects (or an empty array).
	 * 
	 * @param {function} [value] the hole remover function to use
	 * @return when used as a getter, the current hole remover function, otherwise this object
	 * @memberOf sn.datumLoader
	 */
	that.holeRemoverCallback = function(value) {
		if ( !arguments.length ) { return holeRemoverCallback; }
		if ( typeof value === 'function' ) {
			holeRemoverCallback = value;
		}
		return that;
	};
	
	/**
	 * Get or set the callback function, invoked after all data has been loaded.
	 * 
	 * @param {function} [value] the callback function to use
	 * @return when used as a getter, the current callback function, otherwise this object
	 * @memberOf sn.datumLoader
	 */
	that.callback = function(value) {
		if ( !arguments.length ) { return finishedCallback; }
		if ( typeof value === 'function' ) {
			finishedCallback = value;
		}
		return that;
	};
	
	/**
	 * Initiate loading the data.
	 * 
	 * @memberOf sn.datumLoader
	 */
	that.load = function() {
		state = 1;
		loadData();
		return that;
	};

	return that;
};

}());
