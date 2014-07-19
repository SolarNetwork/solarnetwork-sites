/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.4
 * @require solarnetwork-d3-chart-power-area-overlap 1.0.0
 */

sn.config.debug = true;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.excludeSources = new sn.Configuration();

//adjust display units as needed (between W and kW, etc)
function adjustChartDisplayUnits(chartKey, baseUnit, scale, unitKind) {
	var unit = (scale === 1000000 ? 'M' : scale === 1000 ? 'k' : '') + baseUnit;
	d3.selectAll(chartKey +' .unit').text(unit);
	if ( unitKind !== undefined ) {
		d3.selectAll(chartKey + ' .unit-kind').text(unitKind);
	}
}

//handle clicks on legend handler
function legendClickHandler(d, i) {
	sn.runtime.excludeSources.toggle(d.source);
	if ( sn.runtime.powerAreaOverlapChart !== undefined ) {
		sn.runtime.powerAreaOverlapChart.regenerate();
		adjustChartDisplayUnits('.power-area-chart', 
				(sn.runtime.powerAreaOverlapChart.aggregate() === 'Minute' ? 'W' : 'Wh'), 
				sn.runtime.powerAreaOverlapChart.yScale(),
				(sn.runtime.powerAreaOverlapChart.aggregate() === 'Minute' ? 'power' : 'energy'));
	}
}

//show/hide the proper range selection based on the current aggregate level
function updateRangeSelection() {
	d3.selectAll('#details div.range').style('display', function() {
		return (d3.select(this).classed(sn.runtime.powerAreaOverlapParameters.aggregate.toLowerCase()) ? 'block' : 'none');
	});
}

function colorDataTypeSourceMapper(e, i, sourceId) {
	if ( sourceId === '' ) {
		sourceId = 'Main';
	}
	return sn.runtime.sourceColorMap.displaySourceMap[e][sourceId];
}

function colorForDataTypeSource(dataType, sourceId) {
	if ( sourceId === '' ) {
		sourceId = 'Main';
	}
	return sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
}

/**
 * An power stacked area chart that overlaps two or more data sets.
 * 
 * You can use the {@code excludeSources} parameter to dynamically alter which sources are visible
 * in the chart. After changing the configuration call {@link sn.chart.powerAreaOverlapChart#regenerate()}
 * to re-draw the chart.
 * 
 * Note that the global {@link sn.colorFn} function is used to map sources to colors, so that
 * must be set up previously.
 * 
 * @class
 * @param {string[]} dataTypes - array of data types to load data for
 * @param {function} dataTypeUrlHelperProvider - function that returns a {@link sn.nodeUrlHelper} for a given data type
 * @param {date} start - the start date
 * @param {date} end - the end date
 * @param {string} aggregate - optional aggregate level
 * @param {number} precision - optional precision level (for Minute level aggregation only)
 * @returns {sn.datumLoader}
 */
sn.datumLoader = function(dataTypes, dataTypeUrlHelperProvider,  start, end, aggregate, precision) {
	
	var that = {
			version : '1.0.0'
	};

	//var dataTypeSourceMapper = undefined;
	var requestOptions = undefined;
	var finishedCallback = undefined;

	var state = {}; // keys are data types, values are 1:loading, 2:done
	var results = {};
	
	function aggregateValue() {
		return (aggregate === undefined ? 'Hour'  : aggregate);
	}
	
	function precisionValue() {
		return (precision === undefined ? 10 : precision);
	}
	
	function requestCompletionHandler(dataType) {
		state[dataType] = 2; // done
		
		// check if we're all done loading, and if so call our callback function
		if ( dataTypes.every(function(e) { return state[e] == 2; }) && finishedCallback ) {
			finishedCallback.call(that, results);
		}
	}

	function loadForDataType(dataType, dataTypeIndex, offset) {
		var urlHelper = dataTypeUrlHelperProvider(dataType, dataTypeIndex);
		var opts = {};
		var key = undefined;
		if ( requestOptions ) {
			for ( key in requestOptions ) {
				opts[key] = requestOptions[key];
			}
		}
		if ( offset ) {
			opts.offset = offset;
		}
		var url;
		var dataExtractor;
		var offsetExtractor;
		if ( aggregateValue() === 'Minute' ) {
			// use /query to normalize minutes
			url = urlHelper.dateTimeQuery(dataType, start, end, precisionValue(), opts);
			dataExtractor = function(json) {
				if ( json.success !== true || Array.isArray(json.data) !== true ) {
					return undefined;
				}
				return json.data;
			};
			offsetExtractor = function() { return 0; };
		} else {
			// use /list for faster access
			url = urlHelper.dateTimeList(dataType, start, end, aggregateValue(), opts);
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
			var dataArray = dataExtractor(json);
			var nextOffset;
			if ( dataArray === undefined ) {
				sn.log('No data available for node {0} data type {1}', urlHelper.nodeId(), dataType);
				requestCompletionHandler(dataType);
				return;
			}
			if ( results[dataType] === undefined ) {
				results[dataType] = dataArray;
			} else {
				results[dataType] = results[dataType].concat(dataArray);
			}
			
			// see if we need to load more results
			nextOffset = offsetExtractor(json);
			if ( nextOffset > 0 ) {
				loadForDataType(dataType, dataTypeIndex, nextOffset);
			} else {
				requestCompletionHandler(dataType);
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
		if ( !arguments.length ) return requestOptions;
		requestOptions = value;
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
		if ( !arguments.length ) return finishedCallback;
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
		dataTypes.forEach(function(e) {
			state[e] = 1; // loading
		});
		dataTypes.forEach(function(e, i) {
			loadForDataType(e, i);
		});
		return that;
	};

	return that;
};

function chartDataCallback(dataType, datum) {
	// create date property
	if ( datum.localDate ) {
		datum.date = sn.dateTimeFormat.parse(datum.localDate +' ' +datum.localTime);
	} else if ( datum.created ) {
		datum.date = sn.timestampFormat.parse(datum.created);
	} else {
		datum.date = null;
	}

	/* map source ID
	var mappedSourceId = colorDataTypeSourceMapper(dataType, null, datum.sourceId);
	if ( mappedSourceId !== undefined ) {
		datum.sourceId = mappedSourceId;
	}
	*/
}

// Watt stacked area chart
function powerAreaOverlapChartSetup(endDate, sourceMap) {
	var end;
	var start;
	var timeCount;
	var timeUnit;
	var precision = (sn.env.minutePrecision || 10);
	// for aggregate time ranges, the 'end' date in inclusive
	if ( sn.runtime.powerAreaOverlapParameters.aggregate === 'Month' ) {
		timeCount = (sn.env.numYears || 1);
		timeUnit = 'year';
		end = d3.time.month.utc.floor(endDate);
		start = d3.time.year.utc.offset(end, -timeCount);
	} else if ( sn.runtime.powerAreaOverlapParameters.aggregate === 'Day' ) {
		timeCount = (sn.env.numMonths || 4);
		timeUnit = 'month';
		end = d3.time.day.utc.floor(endDate);
		start = d3.time.month.utc.offset(end, -timeCount);
	} else if ( sn.runtime.powerAreaOverlapParameters.aggregate === 'Hour' ) {
		timeCount = (sn.env.numDays || 7);
		timeUnit = 'day';
		end = d3.time.hour.utc.floor(endDate);
		start = d3.time.day.utc.offset(end, -timeCount);
	} else {
		// assume Minute
		timeCount = (sn.env.numHours || 24);
		timeUnit = 'hour';
		end = d3.time.minute.utc.ceil(endDate);
		end.setUTCMinutes((end.getUTCMinutes() + precision - (end.getUTCMinutes() % precision)), 0, 0);
		start = d3.time.hour.utc.offset(end, -timeCount);
	}
	
	d3.select('.power-area-chart .time-count').text(timeCount);
	d3.select('.power-area-chart .time-unit').text(timeUnit);
	
	sn.datumLoader(sn.env.dataTypes, urlHelperForAvailbleDataRange, 
			start, end, sn.runtime.powerAreaOverlapParameters.aggregate)
		.callback(function(results) {
			sn.env.dataTypes.forEach(function(e, i) {
				var dataTypeResults = results[e];
				sn.runtime.powerAreaOverlapChart.load(dataTypeResults, e);
			});
			sn.runtime.powerAreaOverlapChart.regenerate();
			sn.log("Power Area chart watt range: {0}", sn.runtime.powerAreaOverlapChart.yDomain());
			sn.log("Power Area chart time range: {0}", sn.runtime.powerAreaOverlapChart.xDomain());
			adjustChartDisplayUnits('.power-area-chart', 
					(sn.runtime.powerAreaOverlapChart.aggregate() === 'Minute' ? 'W' : 'Wh'), 
					sn.runtime.powerAreaOverlapChart.yScale(),
					(sn.runtime.powerAreaOverlapChart.aggregate() === 'Minute' ? 'power' : 'energy'));
		}).load();
}

function setup(repInterval, sourceMap) {
	sn.runtime.reportableEndDate = repInterval.eLocalDate;
	sn.runtime.sourceMap = sourceMap;
	sn.runtime.sourceColorMap = sn.sourceColorMapping(sourceMap);
	
	// we make use of sn.colorFn, so stash the required color map where expected
	sn.runtime.colorData = sn.runtime.sourceColorMap.colorMap;

	// set up form-based details
	d3.select('#details .consumption').style('color', 
			sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Consumption'][sourceMap['Consumption'][0]]]);
	d3.select('#details .generation').style('color', 
			sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Power'][sourceMap['Power'][0]]]);

	// create copy of color data for reverse ordering so labels vertically match chart layers
	sn.colorDataLegendTable('#source-labels', sn.runtime.sourceColorMap.colorMap.slice().reverse(), legendClickHandler, function(s) {
		if ( sn.env.linkOld === 'true' ) {
			s.html(function(d) {
				return '<a href="' +sn.runtime.urlHelper.nodeDashboard(d) +'">' +d +'</a>';
			});
		} else {
			s.text(Object);
		}
	});

	updateRangeSelection();

	powerAreaOverlapChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
}

function urlHelperForAvailbleDataRange(e, i) {
	if ( !arguments.length ) return sn.runtime.urlHelper;
	return (i === 0 ? sn.runtime.consumptionUrlHelper : sn.runtime.urlHelper);
}

function setupUI() {
	d3.selectAll('.node-id').text(sn.env.nodeId);

	// update details form based on env
	['nodeId', 'consumptionNodeId', 'numHours', 'numDays', 'numMonths', 'numYears'].forEach(function(e) {
		d3.select('input[name='+e+']').property('value', sn.env[e]);
	});
	d3.select('input[name=wiggle]').attr('checked', function() {
		return (sn.env.wiggle === 'true' ? 'checked' : null);
	});

	// toggle between supported aggregate levels
	d3.select('#range-toggle').classed('clickable', true).on('click', function(d, i) {
		var me = d3.select(this);
		me.classed('hit', true);
		var currAgg = sn.runtime.powerAreaOverlapChart.aggregate();
		sn.runtime.powerAreaOverlapParameters.aggregate = (currAgg === 'Minute' ? 'Hour' : currAgg === 'Hour' ? 'Day' : currAgg === 'Day' ? 'Month' : 'Minute');
		powerAreaOverlapChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
		setTimeout(function() {
			me.classed('hit', false);
		}, 500);
		updateRangeSelection();
	});
	
	// update the chart details
	d3.selectAll('#details input').on('change', function(e) {
		var me = d3.select(this);
		var propName = me.attr('name');
		var getAvailable = false;
		if ( this.type === 'checkbox' ) {
			sn.env[propName] = me.property('checked');
		} else {
			sn.env[propName] = me.property('value');
		}
		if ( propName === 'consumptionNodeId' ) {
			sn.runtime.consumptionUrlHelper = sn.nodeUrlHelper(sn.env[propName]);
			getAvailable = true;
		} else if ( propName === 'nodeId' ) {
			sn.runtime.urlHelper = sn.nodeUrlHelper(sn.env[propName]);
			getAvailable = true;
		} else if ( propName === 'wiggle' ) {
			sn.runtime.powerAreaOverlapParameters.value(propName, sn.env[propName]);
			sn.runtime.powerAreaOverlapChart.regenerate();
			return;
		}
		if ( getAvailable ) {
			sn.availableDataRange(urlHelperForAvailbleDataRange, sn.env.dataTypes);
		} else {
			powerAreaOverlapChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
		}
	});
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 108,
		consumptionNodeId : 108,
		minutePrecision : 10,
		numHours : 24,
		numDays : 7,
		numMonths : 4,
		numYears : 2,
		wiggle : 'true',
		linkOld : 'false',
		dataTypes: ['Consumption', 'Power']
	});
	
	sn.runtime.wChartRefreshMs = sn.env.minutePrecision * 60 * 1000;

	sn.runtime.powerAreaOverlapParameters = new sn.Configuration({
		aggregate : 'Minute',
		excludeSources : sn.runtime.excludeSources,
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false),
		wiggle : (sn.env.wiggle === 'true'),
		plotProperties : {Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	
	sn.runtime.powerAreaOverlapChart = sn.chart.powerAreaOverlapChart('#power-area-chart', sn.runtime.powerAreaOverlapParameters)
		.dataCallback(chartDataCallback)
		.colorCallback(colorForDataTypeSource);
	
	setupUI();

	// find our available data range, and then draw our charts!
	function handleAvailableDataRange(event) {
		setup(event.data.reportableInterval, event.data.availableSourcesMap);
		if ( sn.runtime.refreshTimer === undefined ) {
			// refresh chart data on interval
			sn.runtime.refreshTimer = setInterval(function() {
				sn.availableDataRange(urlHelperForAvailbleDataRange, sn.env.dataTypes, function(data) {
					var jsonEndDate = data.reportableInterval.eLocalDate;
					if ( jsonEndDate.getTime() > sn.runtime.reportableEndDate.getTime() ) {
						if ( sn.runtime.powerAreaOverlapChart !== undefined ) {
							powerAreaOverlapChartSetup(jsonEndDate, sn.runtime.sourceMap);
						}
					}
				});
			}, sn.runtime.wChartRefreshMs);
		}
	}
	document.addEventListener('snAvailableDataRange', handleAvailableDataRange, false);
	sn.runtime.urlHelper = sn.nodeUrlHelper(sn.env.nodeId);
	sn.runtime.consumptionUrlHelper = sn.nodeUrlHelper(sn.env.consumptionNodeId);
	sn.availableDataRange(urlHelperForAvailbleDataRange, sn.env.dataTypes);
}
