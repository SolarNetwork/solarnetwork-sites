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
	var energyBarChart = undefined;
	
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
	function displayDataType(dataType) {
		return (dataType === 'Power' ? 'Generation' : 'Consumption');
	}
	for ( dataType in sourceMap ) {
		chartSourceMap[dataType] = {};
		typeSourceList = [];
		sourceMap[dataType].forEach(function(el) {
			var mappedSource;
			if ( el === '' || el === 'Main' ) {
				mappedSource = displayDataType(dataType);
			} else {
				mappedSource = displayDataType(dataType) +' / ' +el;
			}
			chartSourceMap[dataType][el] = mappedSource;
			typeSourceList.push(mappedSource);
			sourceList.push(mappedSource);
		});
		if ( dataType === sn.env.dataTypes[0] ) {
			colorGroup = colorbrewer.Blues;
		} else {
			colorGroup = colorbrewer.Greens;
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

	// adjust display units as needed (between W and kW, etc)
	function adjustChartDisplayUnits(chartKey, baseUnit, scale) {
		var unit = (scale === 1000000 ? 'M' : scale === 1000 ? 'k' : '') + baseUnit;
		d3.selectAll(chartKey +' .unit').text(unit);
	}

	// Watt stacked area chart
	function wattHourChartSetup(endDate) {
		var end = new Date(endDate.getTime());
		end.setMinutes(0, 0, 0); // truncate end date to nearest hour
		
		var whRange = [
			new Date(end.getTime() - ((sn.env.numDays * 24 - 1) * 60 * 60 * 1000)), 
			new Date(end.getTime())
			];
		energyBarChart = sn.chart.energyIOBarChart('#week-watthour', {
			height: 400,
			excludeSources: sn.runtime.excludeSources
		});
		var q = queue();
		sn.env.dataTypes.forEach(function(e, i) {
			var urlHelper = (i === 0 ? sn.runtime.devUrlHelper : sn.runtime.urlHelper); // FIXME: remove
			q.defer(d3.json, urlHelper.dateTimeQuery(e, whRange[0], whRange[1], 'Hour'));
		});
		q.awaitAll(function(error, results) {
			if ( error ) {
				sn.log('Error requesting data: ' +error);
				return;
			}
			var combinedData = [];
			var i, iMax, j, jMax, json, datum, mappedSourceId;
			for ( i = 0, iMax = results.length; i < iMax; i++ ) {
				json = results[i];
				if ( json.success !== true || Array.isArray(json.data) !== true ) {
					sn.log('No data available for node {0} data type {1}', sn.runtime.urlHelper.nodeId(), sn.env.dataTypes[i]);
					return;
				}
				for ( j = 0, jMax = json.data.length; j < jMax; j++ ) {
					datum = json.data[j];
					mappedSourceId = sn.runtime.chartSourceMap[sn.env.dataTypes[i]][datum.sourceId];
					if ( mappedSourceId !== undefined ) {
						datum.sourceId = mappedSourceId;
					}
				}
				combinedData = combinedData.concat(json.data);
			}
			energyBarChart.consumptionSourceCount(sourceMap[sn.env.dataTypes[0]].length);
			energyBarChart.load(combinedData);
			sn.log("Energy IO chart watt hour range: {0}", energyBarChart.yDomain());
			sn.log("Energy IO chart time range: {0}", energyBarChart.xDomain());
			adjustChartDisplayUnits('.watthour-chart', 'Wh', energyBarChart.yScale());
		});
	}
	
	wattHourChartSetup(endDate);
	setInterval(function() {
		d3.json(sn.runtime.urlHelper.reportableInterval(sn.env.dataTypes), function(error, json) {
			if ( json.data === undefined || json.data.endDateMillis === undefined ) {
				sn.log('No data available for node {0}: {1}', sn.runtime.urlHelper.nodeId(), (error ? error : 'unknown reason'));
				return;
			}
			
			var endDate = sn.dateTimeFormat.parse(json.data.endDate);
			var xDomain = energyBarChart.xDomain();
			var currEndDate = xDomain[xDomain.length - 1];
			var newEndDate = new Date(endDate.getTime());
			currEndDate.setMinutes(0,0,0); // truncate to nearest hour
			newEndDate.setMinutes(0,0,0);
			if ( newEndDate.getTime() > currEndDate.getTime() ) {
				wattHourChartSetup(endDate);
			}
		});
	}, sn.config.wChartRefreshMs);
	
	function legendClickHandler(d, i) {
		sn.runtime.excludeSources.toggle(d.source);
		if ( energyBarChart !== undefined ) {
			// use a slight delay, otherwise transitions can be jittery
			setTimeout(function() {
				energyBarChart.regenerate();
				adjustChartDisplayUnits('.watthour-chart', 'Wh', energyBarChart.yScale());
			}, sn.config.defaultTransitionMs * .8);
		}
	}
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 30,
		consumptionNodeId : 108,
		numDays : 7,
		maxPowerKW : 3,
		dataTypes: ['Consumption', 'Power']
	});
	sn.config.wChartRefreshMs = 30 * 60 * 1000;
	
	// setup DOM based on environment
	d3.select('#num-days').text(sn.env.numDays);
	d3.selectAll('.node-id').text(sn.env.nodeId);
	
	// find our available data range, and then draw our charts!
	function handleAvailableDataRange(event) {
		setup(event.data.reportableInterval, event.data.availableSourcesMap);
		document.removeEventListener('snAvailableDataRange', handleAvailableDataRange, false);
	}
	document.addEventListener('snAvailableDataRange', handleAvailableDataRange, false);
	sn.runtime.urlHelper = sn.nodeUrlHelper(sn.env.nodeId);
	sn.runtime.devUrlHelper = sn.nodeUrlHelper(sn.env.consumptionNodeId);
	sn.availableDataRange(function(e, i) {
		if ( !arguments.length ) return sn.runtime.urlHelper;
		return (i === 0 ? sn.runtime.devUrlHelper : sn.runtime.urlHelper);
	}, sn.env.dataTypes);
}
