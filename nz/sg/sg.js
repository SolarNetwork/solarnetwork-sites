/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-energy-io 1.0.0
 * @require solarnetwork-d3-chart-pie-io 1.0.0
 */

sn.config.debug = true;
//sn.config.host = 'localhost:8680';

(function(window) {
'use strict';

var app;

var sgSchoolApp = function(nodeUrlHelper) {
	var self = { version : '1.0.0' };
	var urlHelper = nodeUrlHelper;

	// auto-refresh settings
	var refreshMs = 60000,
		refreshTimer;
	
	// configuration
	var consumptionSources = [],
		generationSources = [],
		hours = 24,
		days = 7,
		months = 4,
		yearMonths = 24;
		
	/**
	 * Get or set the consumption source IDs.
	 * 
	 * @param {array|string} [value] the array of source ID values, or if a string a comma-delimited list of source ID values
	 * @return when used as a getter, the current source IDs, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function consumptionSourceIds(value) {
		if ( !arguments.length ) return consumptionSources;
		if ( Array.isArray(value) ) {
			consumptionSources = value;
		} else if ( typeof value === 'string' ) {
			consumptionSources = value.split(/\s*,\s*/);
		}
		return self;
	}
	
	/**
	 * Get or set the generation source IDs.
	 * 
	 * @param {array|string} [value] the array of source ID values, or if a string a comma-delimited list of source ID values
	 * @return when used as a getter, the current source IDs, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function generationSourceIds(value) {
		if ( !arguments.length ) return generationSources;
		if ( Array.isArray(value) ) {
			generationSources = value;
		} else if ( typeof value === 'string' ) {
			generationSources = value.split(/\s*,\s*/);
		}
		return self;
	}
	
	/**
	 * Get or set the number of hours to display for the TenMinute aggregate level.
	 * 
	 * @param {number} [value] the number of hours to display
	 * @return when used as a getter, the number of hours, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function numHours(value) {
		if ( !arguments.length ) return numHours;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			numHours = n;
		}
		return self;
	}
	
	/**
	 * Get or set the number of days to display for the Hour aggregate level.
	 * 
	 * @param {number} [value] the number of days to display
	 * @return when used as a getter, the number of days, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function numDays(value) {
		if ( !arguments.length ) return numDays;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			numDays = n;
		}
		return self;
	}
	
	/**
	 * Get or set the number of months to display for the Day aggregate level.
	 * 
	 * @param {number} [value] the number of months to display
	 * @return when used as a getter, the number of months, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function numMonths(value) {
		if ( !arguments.length ) return numMonths;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			numMonths = n;
		}
		return self;
	}
	
	/**
	 * Get or set the number of months to display for the Month aggregate level.
	 * 
	 * @param {number} [value] the number of months to display
	 * @return when used as a getter, the number of years, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function numYearMonths(value) {
		if ( !arguments.length ) return numYearMonths;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			numYearMonths = n;
		}
		return self;
	}
	
	/**
	 * Start the application, after configured.
	 * 
	 * @return this object
	 * @memberOf sgSchoolApp
	 */
	function start() {
		refresh();
		if ( refreshTimer === undefined ) {
			refreshTimer = setInterval(refresh, refreshMs);
		}
		return self;
	}
	
	function refresh() {
		// TODO
	}
	
	function init() {
		Object.defineProperties(self, {
			consumptionSourceIds 	: { value : consumptionSourceIds },
			generationSourceIds 	: { value : generationSourceIds },
			numHours				: { value : numHours },
			numDays					: { value : numDays },
			numMonths				: { value : numMonths },
			numYearMonths			: { value : numYearMonths },
			start 					: { value : start }
		});
		return self;
	}
	
	return init();
};

function startApp(env) {
	var urlHelper;
	
	if ( !env ) {
		env = sn.util.copy(sn.env, {
			nodeId : 175,
			numHours : 24,
			numDays : 7,
			numMonths : 12,
			numYearMonths : 24,
			sourceIds : 'Solar',
			consumptionSourceIds : 'Ph1,Ph2,Ph3'
		});
	}
	
	urlHelper = sn.datum.nodeUrlHelper(env.nodeId, { tls : sn.config.tls, host : sn.config.host });

	app = sgSchoolApp(urlHelper)
		.generationSourceIds(env.sourceIds)
		.consumptionSourceIds(env.consumptionSourceIds)
		.numHours(env.numHours)
		.numDays(env.numDays)
		.numMonths(env.numMonths)
		.numYearMonths(env.numYearMonths)
		.start();
	
	return app;
}

sn.runtime.sgSchoolApp = startApp;

}(window));
