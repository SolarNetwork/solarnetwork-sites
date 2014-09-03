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
				sn.log('Error requesting data for node {0} source {1}: {2}', urlHelper.nodeId(), sourceId, error);
				return;
			}
			dataArray = dataExtractor(json);
			if ( dataArray === undefined ) {
				sn.log('No data available for node {0} source {1}', urlHelper.nodeId(), sourceId);
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
