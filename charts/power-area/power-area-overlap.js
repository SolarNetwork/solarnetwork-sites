/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.4
 * @require solarnetwork-d3-chart-power-area-overlap 1.0.0
 */

sn.config.debug = true;
sn.runtime.excludeSources = new sn.Configuration();

//adjust display units as needed (between W and kW, etc)
function adjustChartDisplayUnits(chartKey, baseUnit, scale, unitKind) {
	var unit = (scale === 1000000000 ? 'G' : scale === 1000000 ? 'M' : scale === 1000 ? 'k' : '') + baseUnit;
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
				(sn.runtime.powerAreaOverlapChart.aggregate() === 'TenMinute' ? 'W' : 'Wh'), 
				sn.runtime.powerAreaOverlapChart.yScale(),
				(sn.runtime.powerAreaOverlapChart.aggregate() === 'TenMinute' ? 'power' : 'energy'));
	}
}

function sourceExcludeCallback(dataType, sourceId) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.excludeSources.enabled(mappedSourceId);
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

function colorForDataTypeSource(dataType, sourceId, sourceIndex) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.colorData[mappedSourceId];
}

function chartDataCallback(dataType, datum) {
	// create date property
	if ( datum.localDate ) {
		datum.date = sn.dateTimeFormat.parse(datum.localDate +' ' +datum.localTime);
	} else if ( datum.created ) {
		datum.date = sn.timestampFormat.parse(datum.created);
	} else {
		datum.date = null;
	}
}

// Watt stacked area overlap chart
function powerAreaOverlapChartSetup(endDate) {
	var sourceMap = sn.runtime.sourceGroupMap;
	var queryRange = sn.datum.loaderQueryRange(sn.runtime.powerAreaOverlapParameters.aggregate, sn.env, endDate);
	
	d3.select('.power-area-chart .time-count').text(queryRange.timeCount);
	d3.select('.power-area-chart .time-unit').text(queryRange.timeUnit);
	
	var plotPropName = sn.runtime.powerAreaOverlapParameters.plotProperties[sn.runtime.powerAreaOverlapParameters.aggregate];
	
	sn.datum.multiLoader([
		sn.datum.loader(sourceMap['Consumption'], sn.runtime.consumptionUrlHelper, 
			queryRange.start, queryRange.end, sn.runtime.powerAreaOverlapParameters.aggregate),
		sn.datum.loader(sourceMap['Generation'], sn.runtime.urlHelper, 
			queryRange.start, queryRange.end, sn.runtime.powerAreaOverlapParameters.aggregate)
	]).callback(function(error, results) {
		if ( !(Array.isArray(results) && results.length === 2) ) {
			sn.log("Unable to load data for Power Area chart: {0}", error);
			return;
		}
		sn.runtime.powerAreaOverlapChart.reset();
		// note the order we call load dictates the layer order of the chart... each call starts a new layer on top of previous layers
		sn.runtime.powerAreaOverlapChart.load(results[0], 'Consumption');
		sn.runtime.powerAreaOverlapChart.load(results[1], 'Generation');
		sn.runtime.powerAreaOverlapChart.regenerate();
		sn.log("Power Area chart watt range: {0}", sn.runtime.powerAreaOverlapChart.yDomain());
		sn.log("Power Area chart time range: {0}", sn.runtime.powerAreaOverlapChart.xDomain());
		adjustChartDisplayUnits('.power-area-chart', 
				(sn.runtime.powerAreaOverlapChart.aggregate() === 'TenMinute' ? 'W' : 'Wh'), 
				sn.runtime.powerAreaOverlapChart.yScale(),
				(sn.runtime.powerAreaOverlapChart.aggregate() === 'TenMinute' ? 'power' : 'energy'));
	}).load();
}

function setup(repInterval) {
	sn.runtime.reportableEndDate = repInterval.eDate;
	if ( sn.runtime.sourceColorMap === undefined ) {
		sn.runtime.sourceColorMap = sn.sourceColorMapping(sn.runtime.sourceGroupMap);
	
		// we make use of sn.colorFn, so stash the required color map where expected
		sn.runtime.colorData = sn.runtime.sourceColorMap.colorMap;

		// set up form-based details
		d3.select('#details .consumption').style('color', 
				sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Consumption'][sn.runtime.sourceGroupMap['Consumption'][0]]]);
		d3.select('#details .generation').style('color', 
				sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Generation'][sn.runtime.sourceGroupMap['Generation'][0]]]);

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
	}

	updateRangeSelection();

	powerAreaOverlapChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceGroupMap);
}

function urlHelperForAvailbleDataRange(e, i) {
	if ( !arguments.length ) return sn.runtime.urlHelper;
	return (i === 0 ? sn.runtime.consumptionUrlHelper : sn.runtime.urlHelper);
}

function setupUI() {
	d3.selectAll('.node-id').text(sn.env.nodeId);

	// update details form based on env
	d3.selectAll('#details input')
		.on('change', function(e) {
			var me = d3.select(this);
			var propName = me.attr('name');
			var getAvailable = false;
			if ( this.type === 'checkbox' ) {
				sn.env[propName] = me.property('checked');
			} else {
				sn.env[propName] = me.property('value');
			}
			if ( propName === 'consumptionNodeId' ) {
				sn.runtime.consumptionUrlHelper = sn.datum.nodeUrlHelper(sn.env[propName]);
				getAvailable = true;
			} else if ( propName === 'nodeId' ) {
				sn.runtime.urlHelper = sn.datum.nodeUrlHelper(sn.env[propName]);
				getAvailable = true;
			} else if ( propName === 'sourceIds'|| propName === 'consumptionSourceIds' ) {
				getAvailable = true;
			} else if ( propName === 'wiggle' ) {
				sn.runtime.powerAreaOverlapParameters.value(propName, sn.env[propName]);
				sn.runtime.powerAreaOverlapChart.regenerate();
				return;
			}
			if ( getAvailable ) {
				sn.datum.availableDataRange(sourceSets(true), function(reportableInterval) {
					setup(reportableInterval);
				});
			} else {
				powerAreaOverlapChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
			}
		}).each(function(e) {
			var input = d3.select(this);
			var name = input.attr('name');
			if ( sn.env[name] !== undefined ) {
				if ( input.property('type') === 'checkbox' ) {
					input.attr('checked', (sn.env[name] === 'true' ? 'checked' : null));
				} else {
					input.property('value', sn.env[name]);
				}
			}
		});

	// toggle between supported aggregate levels
	d3.select('#range-toggle').classed('clickable', true).on('click', function(d, i) {
		var me = d3.select(this);
		me.classed('hit', true);
		var currAgg = sn.runtime.powerAreaOverlapChart.aggregate();
		sn.runtime.powerAreaOverlapParameters.aggregate = (currAgg === 'TenMinute' ? 'Hour' : currAgg === 'Hour' ? 'Day' : currAgg === 'Day' ? 'Month' : 'TenMinute');
		powerAreaOverlapChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
		setTimeout(function() {
			me.classed('hit', false);
		}, 500);
		updateRangeSelection();
	});
}

function setupSourceGroupMap() {
	var map = {},
		sourceArray;
	sourceArray = sn.env.sourceIds.split(/\s*,\s*/);
	map['Generation'] = sourceArray;
	
	sourceArray = sn.env.consumptionSourceIds.split(/\s*,\s*/);
	map['Consumption'] = sourceArray;
	
	sn.runtime.sourceGroupMap = map;
}

function sourceSets(regenerate) {
	if ( !sn.runtime.sourceGroupMap || regenerate ) {
		setupSourceGroupMap();
	}
	return [
		{ nodeUrlHelper : sn.runtime.urlHelper, sourceIds : sn.runtime.sourceGroupMap['Generation'] },
		{ nodeUrlHelper : sn.runtime.consumptionUrlHelper, sourceIds : sn.runtime.sourceGroupMap['Consumption'] }
	];
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 30,
		sourceIds : 'Power',
		consumptionNodeId : 108,
		consumptionSourceIds : 'A,B,C',
		minutePrecision : 10,
		numHours : 24,
		numDays : 7,
		numMonths : 4,
		numYears : 2,
		linkOld : 'false'
	});
	
	sn.runtime.wChartRefreshMs = sn.env.minutePrecision * 60 * 1000;

	sn.runtime.powerAreaOverlapParameters = new sn.Configuration({
		aggregate : 'Hour',
		excludeSources : sn.runtime.excludeSources,
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false),
		wiggle : (sn.env.wiggle === 'true'),
		plotProperties : {TenMinute : 'watts', Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	
	sn.runtime.powerAreaOverlapChart = sn.chart.powerAreaOverlapChart('#power-area-chart', sn.runtime.powerAreaOverlapParameters)
		.dataCallback(chartDataCallback)
		.colorCallback(colorForDataTypeSource)
		.sourceExcludeCallback(sourceExcludeCallback);
	
	sn.runtime.urlHelper = sn.datum.nodeUrlHelper(sn.env.nodeId);
	sn.runtime.consumptionUrlHelper = sn.datum.nodeUrlHelper(sn.env.consumptionNodeId);

	setupUI();
	sn.datum.availableDataRange(sourceSets(), function(reportableInterval) {
		setup(reportableInterval);
		if ( sn.runtime.refreshTimer === undefined ) {
			// refresh chart data on interval
			sn.runtime.refreshTimer = setInterval(function() {
				sn.datum.availableDataRange(sourceSets(), function(repInterval) {
					var jsonEndDate = repInterval.eDate;
					if ( jsonEndDate.getTime() > sn.runtime.reportableEndDate.getTime() ) {
						setup(repInterval);
					}
				});
			}, sn.runtime.wChartRefreshMs);
		}
	});
}
