/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.4
 * @require solarnetwork-d3-chart-power-area 1.0.0
 */

sn.config.debug = true;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.excludeSources = new sn.Configuration();

//adjust display units as needed (between W and kW, etc)
function adjustChartDisplayUnits(chartKey, baseUnit, scale, unitKind) {
	var unit = (scale === 1000000000 ? 'G' : scale === 1000000 ? 'M' : scale === 1000 ? 'k' : '') + baseUnit;
	d3.selectAll(chartKey +' .unit').text(unit);
	if ( unitKind !== undefined ) {
		d3.selectAll(chartKey + ' .unit-kind').text(unitKind);
	}
}

function regenerateChart(chart) {
	if ( chart === undefined ) {
		return;
	}
	chart.regenerate();
	adjustChartDisplayUnits('.power-area-chart', 
			(chart.aggregate() === 'TenMinute' ? 'W' : 'Wh'), 
			chart.yScale(),
			(chart.aggregate() === 'TenMinute' ? 'power' : 'energy'));
}

//handle clicks on legend handler
function legendClickHandler(d, i) {
	sn.runtime.excludeSources.toggle(d.source);
	regenerateChart(sn.runtime.powerAreaChart);
}

//show/hide the proper range selection based on the current aggregate level
function updateRangeSelection() {
	d3.selectAll('#details div.range').style('display', function() {
		return (d3.select(this).classed(sn.runtime.powerAreaParameters.aggregate.toLowerCase()) ? 'block' : 'none');
	});
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

function sourceExcludeCallback(dataType, sourceId) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.excludeSources.enabled(mappedSourceId);
}

function colorForDataTypeSource(dataType, sourceId, sourceIndex) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.colorData[mappedSourceId];
}

// Watt stacked area chart
function powerAreaChartSetup(endDate, chart, parameters) {
	var sourceMap = sn.runtime.sourceGroupMap;
	var queryRange = sn.datum.loaderQueryRange(parameters.aggregate, sn.env, endDate);
	
	d3.select('.power-area-chart .time-count').text(queryRange.timeCount);
	d3.select('.power-area-chart .time-unit').text(queryRange.timeUnit);
	
	var plotPropName = parameters.plotProperties[parameters.aggregate];
	
	sn.datum.multiLoader([
		sn.datum.loader(sourceMap['Consumption'], sn.runtime.consumptionUrlHelper, 
			queryRange.start, queryRange.end, parameters.aggregate),
		sn.datum.loader(sourceMap['Generation'], sn.runtime.urlHelper, 
			queryRange.start, queryRange.end, parameters.aggregate)
	]).callback(function(error, results) {
		if ( !(Array.isArray(results) && results.length === 2) ) {
			sn.log("Unable to load data for Power Area chart: {0}", error);
			return;
		}
		// note the order we call load dictates the layer order of the chart... each call starts a new layer on top of previous layers
		chart.reset()
			.load(results[0], 'Consumption')
			.load(results[1], 'Generation');
		regenerateChart(chart);
		sn.log("Power Area chart watt range: {0}", chart.yDomain());
		sn.log("Power Area chart time range: {0}", chart.xDomain());
	}).load();
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

	powerAreaChartSetup(sn.runtime.reportableEndDate, sn.runtime.powerAreaChart, sn.runtime.powerAreaParameters);
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
				sn.runtime.powerAreaParameters.value(propName, sn.env[propName]);
				regenerateChart(sn.runtime.powerAreaChart);
				return;
			} else if ( propName === 'scale' ) {
				sn.runtime.powerAreaChart.scaleFactor('Generation', Number(sn.env[propName]));
				regenerateChart(sn.runtime.powerAreaChart);
				return;
			} else if ( propName === 'consumptionScale' ) {
				sn.runtime.powerAreaChart.scaleFactor('Consumption', Number(sn.env[propName]));
				regenerateChart(sn.runtime.powerAreaChart);
				return;
			}
			if ( getAvailable ) {
				sn.datum.availableDataRange(sourceSets(true), function(reportableInterval) {
					delete sn.runtime.sourceColorMap; // to regenerate
					setup(reportableInterval);
				});
			} else {
				powerAreaChartSetup(sn.runtime.reportableEndDate, sn.runtime.powerAreaChart, sn.runtime.powerAreaParameters);
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
		var currAgg = sn.runtime.powerAreaChart.aggregate();
		sn.runtime.powerAreaParameters.aggregate = (currAgg === 'TenMinute' ? 'Hour' : currAgg === 'Hour' ? 'Day' : currAgg === 'Day' ? 'Month' : 'TenMinute');
		powerAreaChartSetup(sn.runtime.reportableEndDate, sn.runtime.powerAreaChart, sn.runtime.powerAreaParameters);
		setTimeout(function() {
			me.classed('hit', false);
		}, 500);
		updateRangeSelection();
	});
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 30,
		sourceIds : 'Power',
		scale : 1,
		consumptionNodeId : 108,
		consumptionSourceIds : 'A,B,C',
		consumptionScale : 1,
		minutePrecision : 10,
		numHours : 24,
		numDays : 7,
		numMonths : 4,
		numYears : 2,
		wiggle : 'true',
		linkOld : 'false'
	});
	
	sn.runtime.wChartRefreshMs = sn.env.minutePrecision * 60 * 1000;

	sn.runtime.powerAreaParameters = new sn.Configuration({
		aggregate : 'Hour',
		excludeSources : sn.runtime.excludeSources,
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false),
		wiggle : (sn.env.wiggle === 'true'),
		plotProperties : {TenMinute : 'watts', Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	
	sn.runtime.powerAreaChart = sn.chart.powerAreaChart('#power-area-chart', sn.runtime.powerAreaParameters)
		.scaleFactor({ 'Generation' : sn.env.scale, 'Consumption' : sn.env.consumptionScale })
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
