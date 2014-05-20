/**
 * @require d3 3.0
 * @require queue 1.0
 */

if ( sn === undefined ) {
	sn = {};
}
if ( sn.util === undefined ) {
	sn.util = {};
}

sn.util.aggregateCounter = function(configuration) {
	var that = {
		version : "1.0.0"
	};
	var config = {
		dataType					: 'Power',
		aggProperty					: 'wattHours',
		startingInterval			: {startDate: d3.time.year.floor(new Date()), endDate:d3.time.minute.floor(new Date())},
		nodeUrlHelper				: sn.runtime.urlHelper,
		refreshMs					: 60000,
		callback					: undefined,
	};
	
	var timer = undefined;
	var aggBase = 0;
	var aggLatest = 0;
	var endDate = undefined;
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
		return aggBase + aggLatest;
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
		var error = false;

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
					// no change to latest
					aggValueLatest = aggLatest;
				}

				// update public aggregate values now that all data collected
				aggBase = aggValueBase;
				aggLatest = aggValueLatest;
				sn.log('Base {0} set to {1}, latest to {2}', config.aggProperty, aggBase, aggLatest);
			
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
				error = true;
			}
			
			// if timer was defined, keep going as if interval set
			if ( timer !== undefined ) {
				timer = setTimeout(update, config.refreshMs);
			}
		}

		var q = queue();
		var noop = function(callback) { callback(null); }

		// pull in up to previous month
		if ( startOfMonth.getTime() > sDate.getTime() && startOfMonth.getTime() < startOfDay.getTime() ) {
			q.defer(d3.json, sn.runtime.urlHelper.dateTimeQuery(config.dataType, sDate, startOfMonth, 'Month', {exclusiveEndDate:true}));
			sDate = startOfMonth;
		} else {
			q.defer(noop);
		}
		
		// pull in up to previous day
		if ( startOfDay.getTime() > sDate.getTime() && startOfDay.getTime() < startOfHour.getTime() ) {
			q.defer(d3.json, sn.runtime.urlHelper.dateTimeQuery(config.dataType, sDate, startOfDay, 'Day', {exclusiveEndDate:true}));
			sDate = startOfDay;
		} else {
			q.defer(noop);
		}
		
		// pull in up to previous hour
		if ( startOfHour.getTime() > sDate.getTime() && startOfHour.getTime() <= eDate.getTime() ) {
			q.defer(d3.json, sn.runtime.urlHelper.dateTimeQuery(config.dataType, sDate, startOfHour, 'Hour', {exclusiveEndDate:true}));
			sDate = startOfHour;
		} else {
			q.defer(noop);
		}
		
		// pull in latest hour, to get just a single hour, this query needs the start date === end date
		if ( sDate.getTime() < eDate.getTime() ) {
			q.defer(d3.json, sn.runtime.urlHelper.dateTimeQuery(config.dataType, sDate, eDate, 'Hour', {exclusiveEndDate:false}));
		} else {
			q.defer(noop);
		}
		
		q.awaitAll(handleResult);
		
		return that;
	}
	
	function start() {
		if ( timer !== undefined ) {
			return;
		}
		timer = setTimeout(update, 20);
		return that;
	}
	that.start = start;
	
	function stop() {
		if ( timer === undefined ) {
			return;
		}
		clearTimeout(timer);
		timer = undefined;
		return that;
	}
	that.stop = stop;

	configure(configuration);
	return that;
};
