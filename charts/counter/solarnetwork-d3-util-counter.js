/*global sn,d3 */
/**
 * @require d3 3.0
 * @require queue 1.0
 */
(function() {
'use strict';

if ( sn.util === undefined ) {
	sn.util = {};
}

/**
 * Calculate a sum total aggregate for a single property over all time on a single SolarNode
 * for a set of source IDs. The class periodically updates the total as time progresses, to
 * keep the total up to date. Configure the class by calling the various methods on it before
 * calling the {@link #start()} method. For example:
 * 
 * <pre>var counter = sn.util.sumCounter(myUrlHelper)
 *     .sourceIds('Main')
 *     .callback(function(sum) {
 *         sn.log('Got sum: {0}', sum);
 *      })
 *      .start();
 * </pre>
 * 
 * The class combines multiple levels of aggregation to efficiently produce the sum, and thus
 * the resulting value can vary slightly from the actual raw data due to rounding and the rate
 * at which aggregate values are updated on SolarNet.
 * 
 * @class
 * @param {function} nodeUrlHelper - a {@link sn.datum.nodeUrlHelper}
 * @returns {sn.util.sumCounter}
 */
sn.util.sumCounter = function(nodeUrlHelper) {
	var that = {
		version : '1.1.0'
	};

	var callback,
		sourceIds = ['Main'],
		aggProperty = 'wattHours',
		refreshMs = 60000,
		timer,
		aggValue = 0;
		
	function sumResults(results, interval) {
		var sum = 0;

		results.forEach(function(d) {
			var val = Number(d[aggProperty]);
			if ( isNaN(val) ) {
				val = 0;
			}
			sum += val;
		});
		
		return sum;
	}
	
	function performSum(finishedCallback) {
		sn.datum.loader(sourceIds, nodeUrlHelper, null, null, 'RunningTotal')
			.callback(function(error, results) {
				var sum	= sumResults(results);
				aggValue = sum;
				finishedCallback();
			}).load();
	}
	
	function update() {
		function finished() {
			if ( callback ) {
				callback.call(that, (aggValue));
			}
			// if timer was defined, keep going as if interval set
			if ( timer !== undefined ) {
				timer = setTimeout(update, refreshMs);
			}
		}
		performSum(finished);
	}
	
	/**
	 * Start updating the counter.
	 * 
	 * @return this object
	 * @memberOf sn.util.sumCounter
	 */
	function start() {
		if ( timer !== undefined ) {
			return;
		}
		timer = setTimeout(update, 20);
		return that;
	}
	
	/**
	 * Stop updating the counter.
	 * 
	 * @return this object
	 * @memberOf sn.util.sumCounter
	 */
	function stop() {
		if ( timer === undefined ) {
			return;
		}
		clearTimeout(timer);
		timer = undefined;
		return that;
	}

	/**
	 * Get or set the callback function. The callback will be passed the current sum total, whenever the sum total changes.
	 * 
	 * @param {function} [value] the source exclude callback
	 * @return when used as a getter, the current source exclude callback function, otherwise this object
	 * @memberOf sn.util.sumCounter
	 */
	that.callback = function(value) {
		if ( !arguments.length ) return callback;
		if ( typeof value === 'function' ) {
			callback = value;
		}
		return that;
	};

	/**
	 * Get or set the callback function. The callback will be passed the current sum total, whenever the sum total changes.
	 * 
	 * @param {array|string} [value] the array of source ID values, or if a string a comma-delimited list of source ID values
	 * @return when used as a getter, the current source IDs, otherwise this object
	 * @memberOf sn.util.sumCounter
	 */
	that.sourceIds = function(value) {
		if ( !arguments.length ) return sourceIds;
		if ( Array.isArray(value) ) {
			sourceIds = value;
		} else if ( typeof value === 'string' ) {
			sourceIds = value.split(/\s*,\s*/);
		}
		return that;
	};

	Object.defineProperties(that, {
		start 	: { value : start },
		stop 	: { value : stop }
	});
	return that;
};

}());
