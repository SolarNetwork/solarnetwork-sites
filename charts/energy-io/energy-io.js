/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-energy-io 1.0.0
 */

sn.config.debug = true;
sn.config.defaultTransitionMs = 600;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.globalCounter = sn.counter();
sn.runtime.excludeSources = new sn.Configuration();

function setup(repInterval, sourceMap) {
	var endDate = repInterval.eDate;
	var energyAreaChart = undefined;
	
	// create static mapping of raw sources to potentially alternate names, to avoid name collisions;
	// sourceMap is like {Consumption : [Main], Power : [Main]}, turn into
	// {Consumption : { Main : 'Consumption/Main' }, Power : { Main : 'Power/Main' } }
	// Also, create static mapping of source -> color, so consistent across charts.
	var chartSourceMap = {};
	var dataType = undefined;
	var sourceList = [];
	var colorGroup = undefined;
	var sourceColors = [];
	var typeSourceList = undefined;
	var colorGroupIndex;
	for ( dataType in sourceMap ) {
		chartSourceMap[dataType] = {};
		typeSourceList = [];
		sourceMap[dataType].forEach(function(el) {
			var mappedSource;
			if ( el === '' || el === 'Main' ) {
				mappedSource = dataType;
			} else {
				mappedSource = dataType +'/' +el;
			}
			chartSourceMap[dataType][el] = mappedSource;
			typeSourceList.push(mappedSource);
			sourceList.push(mappedSource);
		});
		if ( dataType === sn.env.dataTypes[0] ) {
			// positive, make green
			colorGroup = colorbrewer.Greens;
		} else {
			colorGroup = colorbrewer.Blues;
		}
		if ( typeSourceList.length < 3 ) {
			colorGroupIndex = 3;
		} else if ( colorGroup[typeSourceList.length] === undefined ) {
			colorGroupIndex = 9;
		} else {
			colorGroupIndex = typeSourceList.length;
		}
		sourceColors = sourceColors.concat(colorGroup[colorGroupIndex].slice(-typeSourceList.length).reverse());
	}
	sn.runtime.chartSourceMap = chartSourceMap;

	sn.runtime.colorData = sn.colorMap(sourceColors, sourceList);

	// create copy of color data for reverse ordering so labels vertically match chart layers
	sn.colorDataLegendTable('#source-labels', sn.runtime.colorData.slice().reverse(), legendClickHandler, function(s) {
		if ( sn.env.linkOld === 'true' ) {
			s.html(function(d) {
				return '<a href="' +sn.runtime.urlHelper.nodeDashboard(d) +'">' +d +'</a>';
			});
		} else {
			s.text(Object);
		}
	});

	var e = new Date(endDate.getTime());
	e.setMinutes(0,0,0); // truncate to nearest hour

	// adjust display units as needed (between W and kW, etc)
	function adjustChartDisplayUnits(chartKey, baseUnit, scale) {
		var unit = (scale === 1000000 ? 'M' : scale === 1000 ? 'k' : '') + baseUnit;
		d3.selectAll(chartKey +' .unit').text(unit);
	}

	// Watt stacked area chart
	function wattChartSetup(endDate) {
		var e = new Date(endDate.getTime());
		// truncate end date to nearest day precision minutes
		e.setMinutes((endDate.getMinutes() - (endDate.getMinutes() % sn.env.minutePrecision)), 0, 0);
		
		var wRange = [
			new Date(e.getTime() - (sn.env.numHours * 60 * 60 * 1000)), 
			new Date(e.getTime())
			];
		energyAreaChart = sn.chart.energyIOAreaChart('#day-watt', {
			height: 400,
			padding: [10, 0, 20, 30] // gives room to axis
		});
		var q = queue();
		sn.env.dataTypes.forEach(function(e) {
			q.defer(d3.json, sn.runtime.urlHelper.dateTimeQuery(e, wRange[0], wRange[1], sn.env.minutePrecision));
		});
		q.awaitAll(function(error, results) {
			if ( error ) {
				sn.log('Error requesting data: ' +error);
				return;
			}
			var combinedData = [];
			var i, iMax, j, jMax, json, datum, invert, mappedSourceId;
			for ( i = 0, iMax = results.length; i < iMax; i++ ) {
				json = results[i];
				if ( json.success !== true || Array.isArray(json.data) !== true ) {
					sn.log('No data available for node {0} data type {1}', sn.runtime.urlHelper.nodeId(), sn.env.dataTypes[i]);
					return;
				}
				invert = (i > 0 && sn.env.wiggle !== 'true');
				for ( j = 0, jMax = json.data.length; j < jMax; j++ ) {
					datum = json.data[j];
					if ( invert && datum.watts !== undefined ) {
						datum.watts *= -100; // FIXME: this should be -1
						//datum.watts = -datum.watts;
					}
					mappedSourceId = sn.runtime.chartSourceMap[sn.env.dataTypes[i]][datum.sourceId];
					if ( mappedSourceId !== undefined ) {
						datum.sourceId = mappedSourceId;
					}
				}
				combinedData = combinedData.concat(json.data);
			}
			energyAreaChart.load(combinedData);
			adjustChartDisplayUnits('.watt-chart', 'W', energyAreaChart.yScale());
		});
	}
	
	wattChartSetup(endDate);
	setInterval(function() {
		d3.json(sn.runtime.urlHelper.reportableInterval(sn.env.dataTypes), function(error, json) {
			if ( json.data === undefined || json.data.endDateMillis === undefined ) {
				sn.log('No data available for node {0}: {1}', sn.runtime.urlHelper.nodeId(), (error ? error : 'unknown reason'));
				return;
			}
			
			var endDate = sn.dateTimeFormat.parse(json.data.endDate);
			wattChartSetup(endDate);
		});
	}, sn.config.wChartRefreshMs);
	
	function legendClickHandler(d, i) {
		sn.runtime.excludeSources.toggle(d.source);
		if ( energyAreaChart !== undefined ) {
			// use a slight delay, otherwise transitions can be jittery
			setTimeout(function() {
				energyAreaChart.regenerate();
				adjustChartDisplayUnits('.watt-chart', 'W', energyAreaChart.yScale());
			}, sn.config.defaultTransitionMs * .8);
		}
	}
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 30,
		minutePrecision : 10,
		numHours : 24,
		numDays : 7,
		wiggle : 'false',
		linkOld : 'false',
		maxPowerKW : 3,
		dataTypes: ['Power', 'Consumption'] // first is positive, second is negative
	});
	sn.config.wChartRefreshMs = sn.env.minutePrecision * 60 * 1000;
	
	// setup DOM based on environment
	d3.select('#num-days').text(sn.env.numDays);
	d3.select('#num-hours').text(sn.env.numHours);
	d3.selectAll('.node-id').text(sn.env.nodeId);
	
	// find our available data range, and then draw our charts!
	function handleAvailableDataRange(event) {
		setup(event.data.reportableInterval, event.data.availableSourcesMap);
		document.removeEventListener('snAvailableDataRange', handleAvailableDataRange, false);
	}
	document.addEventListener('snAvailableDataRange', handleAvailableDataRange, false);
	sn.runtime.urlHelper = sn.NodeUrlHelper(sn.env.nodeId);
	sn.availableDataRange(sn.runtime.urlHelper, sn.env.dataTypes);
}
