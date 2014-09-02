/**
 * @require d3 3.0
 * @require queue 1.0
 */
(function() {
'use strict';

if ( sn === undefined ) {
	sn = {};
}
if ( sn.util === undefined ) {
	sn.util = {};
}

sn.util.sumCounter = function(nodeUrlHelper) {
	var that = {
		version : '1.0.0'
	};

	var callback,
		sourceIds = ['Main'],
		aggProperty = 'watt_hours',
		refreshMs = 60000,
		timer, 
		endDate,
		aggBase = 0,
		aggPartial = 0;
		
	function nodeUrlHelperProvider(sourceId) {
		return nodeUrlHelper;
	}
	
	function sumResults(results, interval) {
		var sum = 0, 
			partial = 0,
			sourceId, 
			data,
			date,
			mostRecentDate,
			now = new Date().getTime();
		for ( sourceId in results ) {
			if ( results.hasOwnProperty(sourceId) ) {
				data = results[sourceId];
				data.forEach(function(d) {
					var val = Number(d[aggProperty]);
					date = sn.timestampFormat.parse(d.created);
					if ( isNaN(val) ) {
						val = 0;
					}
					if ( interval.offset(date, 1).getTime() > now ) {
						// this time slice extends beyond the current time, so add to partial
						partial += val;
					} else {
						sum += val;
					}
				});
				if ( data.length > 0 ) {
					if ( !mostRecentDate || date.getTime() > mostRecentDate.getTime() ) {
						mostRecentDate = date;
					}
				}
			}
		}
		return {sum : sum, partial : partial, mostRecentDate : mostRecentDate};
	}
	
	function performSum(finishedCallback, aggregateLevel) {
		var interval,
			nextAggregateLevel,
			now = new Date().getTime();
		if ( !aggregateLevel ) {
			aggregateLevel = 'Month';
		}
		while ( true ) {
			if ( aggregateLevel === 'Month' ) {
				interval = d3.time.month.utc;
				nextAggregateLevel = 'Day';
			} else if ( aggregateLevel === 'Day' ) {
				interval = d3.time.day.utc;
				nextAggregateLevel = 'Hour';
			} else {
				interval = d3.time.hour.utc;
				nextAggregateLevel = undefined;
			}
			if ( endDate && nextAggregateLevel && interval.offset(endDate, 1).getTime() > now ) {
				aggregateLevel = nextAggregateLevel;
			} else {
				break;
			}
		}

		sn.datum.loader(sourceIds, nodeUrlHelperProvider, endDate, null, aggregateLevel)
			.callback(function(results) {
				var sum;
				sum	= sumResults(results, interval);
				sn.log('Got {0} sum {1} (partial {2}) from {3} to {4}', aggregateLevel, sum.sum, sum.partial, endDate, sum.mostRecentDate);
				aggBase += sum.sum;
				if ( sum.mostRecentDate ) {
					endDate = sum.mostRecentDate;
					if ( nextAggregateLevel ) {
						performSum(finishedCallback, nextAggregateLevel);
					} else {
						aggPartial = sum.partial;
						finishedCallback();
					}
				} else {
					finishedCallback();
				}
			}).load();
	}
	
	function update() {
		function finished() {
			if ( callback ) {
				callback.call(that, (aggBase + aggPartial));
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

sn.util.counterfoo = function() {
	var clock = undefined; // for adjusting "real time"
	var referenceDate = new Date();
	
	function configure(configuration) {
		var prop = undefined;
		for ( prop in configuration ) {
			config[prop] = configuration[prop];
		}
	}
	that.configure = configure;
	
	function aggregateValue() {
		return aggBase + aggPartial;
	}
	that.aggregateValue = aggregateValue;
	
	function referenceTime() {
		return referenceDate.getTime();
	}
	
	function now(newDate) {
		if ( newDate === undefined ) {
			return (clock === undefined ? new Date() : clock);
		}
		if ( clock === undefined ) {
			// also set reference date to "now"
			referenceDate = newDate;
		}
		clock = newDate;
		sn.log('Clock set to {0}', newDate);
		return that;
	}
	that.now = now;
	
	function update() {
		var sDate = (endDate === undefined ? config.startingInterval.startDate : endDate);
		
		var tDiff = now().getTime() - referenceTime();
		
		// for eDate, start with the provided interval end date, and then track time forward from
		// there, to allow for showing data in other time zones from the browser correctly
		var eDate = (clock !== undefined 
			? clock : new Date(config.startingInterval.endDate.getTime() + tDiff));
		var aggValueBase = aggBase;
		var aggValueLatest = 0;

		sn.log('Calculating total {0} between {1} and {2}', config.aggProperty, sDate, eDate);
		
		var startOfMonth = d3.time.month.floor(eDate);
		var startOfDay = d3.time.day.floor(eDate);
		var startOfHour = d3.time.hour.floor(eDate);
		
		function handleResult(reqError, results) {
			if ( !reqError ) {
				var i = 0;
				var lastIndex = results.length - 1;
				// calculate base sum
				for ( ; i < results.length; i++ ) {
					var json = results[i];
					if ( json !== undefined ) {
						var sum = d3.sum(json.data, function(d) { 
							var val = Number(d[config.aggProperty]);
							return (!isNaN(val) && val !== -1 ? val : 0);
						});
	
						sn.log('{0} total {1} found between {2} and {3}', sum, config.aggProperty, 
							(json.data !== undefined && json.data.length > 0 
								? (json.data[0].localDate +' ' +json.data[0].localTime) : '?'),
							(json.data !== undefined && json.data.length > 0 
								? (json.data[json.data.length-1].localDate +' ' +json.data[json.data.length-1].localTime) : '?'));
						if ( i < lastIndex ) {
							aggValueBase += sum;
						} else {
							aggValueLatest = sum;
						}
					}
				}
				if ( results[lastIndex] === undefined ) {
					// no change to partial
					aggValueLatest = aggPartial;
				}

				// update public aggregate values now that all data collected
				aggBase = aggValueBase;
				aggPartial = aggValueLatest;
				sn.log('Base {0} set to {1}, partial to {2}', config.aggProperty, aggBase, aggPartial);
			
				// set the endDate to the startOfHour we just calculated with, so next update we start from there
				endDate = startOfHour;
			
				// invoke the client callback so they know the data has been updated
				if ( config.callback !== undefined ) {
					try {
						config.callback.call(that);
					} catch ( error ) {
						sn.log('Error in callback: {0}', error);
					}
				}
			} else {
				sn.log('Error requesting aggregate count data: ' +reqError);
			}
			
			// if timer was defined, keep going as if interval set
			if ( timer !== undefined ) {
				timer = setTimeout(update, config.refreshMs);
			}
		}

		var q = queue();
		var noop = function(callback) { callback(null); };

		// pull in up to previous month
		if ( startOfMonth.getTime() > sDate.getTime() && startOfMonth.getTime() < startOfDay.getTime() ) {
			q.defer(d3.json, config.nodeUrlHelper.dateTimeQuery(config.dataType, sDate, startOfMonth, 'Month', {exclusiveEndDate:true}));
			sDate = startOfMonth;
		} else {
			q.defer(noop);
		}
		
		// pull in up to previous day
		if ( startOfDay.getTime() > sDate.getTime() && startOfDay.getTime() < startOfHour.getTime() ) {
			q.defer(d3.json, config.nodeUrlHelper.dateTimeQuery(config.dataType, sDate, startOfDay, 'Day', {exclusiveEndDate:true}));
			sDate = startOfDay;
		} else {
			q.defer(noop);
		}
		
		// pull in up to previous hour
		if ( startOfHour.getTime() > sDate.getTime() && startOfHour.getTime() <= eDate.getTime() ) {
			q.defer(d3.json, config.nodeUrlHelper.dateTimeQuery(config.dataType, sDate, startOfHour, 'Hour', {exclusiveEndDate:true}));
			sDate = startOfHour;
		} else {
			q.defer(noop);
		}
		
		// pull in partial hour, to get just a single hour, this query needs the start date === end date
		if ( sDate.getTime() < eDate.getTime() ) {
			q.defer(d3.json, config.nodeUrlHelper.dateTimeQuery(config.dataType, sDate, eDate, 'Hour', {exclusiveEndDate:false}));
		} else {
			q.defer(noop);
		}
		
		q.awaitAll(handleResult);
		
		return that;
	}
	

	configure(configuration);
	return that;
};

}());
