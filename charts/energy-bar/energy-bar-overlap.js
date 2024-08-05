/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.4
 * @require solarnetwork-d3-chart-energy-bar-overlap 1.0.0
 */

sn.config.debug = true;
sn.runtime.excludeSources = new sn.Configuration();

function regenerateChart() {
	var chart = sn.runtime.energyBarOverlapChart,
		container = sn.runtime.energyBarOverlapContainer;
	if ( chart === undefined ) {
		return;
	}
	chart.regenerate();
	sn.ui.adjustDisplayUnits(container, 'Wh', chart.yScale(), 'energy');
}

//handle clicks on legend handler
function legendClickHandler(d, i) {
	sn.runtime.excludeSources.toggle(d.source);
	regenerateChart();
}

function sourceExcludeCallback(dataType, sourceId) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.excludeSources.enabled(mappedSourceId);
}

//show/hide the proper range selection based on the current aggregate level
function updateRangeSelection() {
	d3.selectAll('#details div.range').style('display', function() {
		return (d3.select(this).classed(sn.runtime.energyBarOverlapParameters.aggregate.toLowerCase()) ? 'block' : 'none');
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
		datum.date = sn.format.dateTimeFormat.parse(datum.localDate +' ' +datum.localTime);
	} else if ( datum.created ) {
		datum.date = sn.format.timestampFormat.parse(datum.created);
	} else {
		datum.date = null;
	}
}

// Watt stacked area overlap chart
function energyBarOverlapChartSetup(endDate, chart, parameters) {
	var sourceMap = sn.runtime.sourceGroupMap;
	var queryRange = sn.api.datum.loaderQueryRange(parameters.aggregate, sn.env, endDate);
	
	d3.select('.energy-bar-chart .time-count').text(queryRange.timeCount);
	d3.select('.energy-bar-chart .time-unit').text(queryRange.timeUnit);
	
	var plotPropName = parameters.plotProperties[parameters.aggregate];
	
	sn.api.datum.multiLoader([
		sn.api.datum.loader(sourceMap['Consumption'], sn.runtime.consumptionUrlHelper, 
			queryRange.start, queryRange.end, parameters.aggregate),
		sn.api.datum.loader(sourceMap['Generation'], sn.runtime.urlHelper, 
			queryRange.start, queryRange.end, parameters.aggregate)
	]).callback(function(error, results) {
		if ( !(Array.isArray(results) && results.length === 2) ) {
			sn.log("Unable to load data for Energy Bar chart: {0}", error);
			return;
		}
		// note the order we call load dictates the layer order of the chart... each call starts a new layer on top of previous layers
		chart.reset()
			.load(results[0], 'Consumption')
			.load(results[1], 'Generation');
		regenerateChart();
		sn.log("Energy Bar chart watt range: {0}", chart.yDomain());
		sn.log("Energy Bar chart time range: {0}", chart.xDomain());
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
	if ( !sn.runtime.sourceGroupMap || !sn.runtime.sourceSets || regenerate ) {
		setupSourceGroupMap();
		sn.runtime.sourceSets = [
			{ nodeUrlHelper : sn.runtime.consumptionUrlHelper, 
				sourceIds : sn.runtime.sourceGroupMap['Consumption'], 
				dataType : 'Consumption' },
			{ nodeUrlHelper : sn.runtime.urlHelper, 
				sourceIds : sn.runtime.sourceGroupMap['Generation'], 
				dataType : 'Generation' }
		];
	}
	return sn.runtime.sourceSets;
}

function setup(repInterval) {
	sn.runtime.reportableEndDate = repInterval.eDate;
	if ( sn.runtime.sourceColorMap === undefined ) {
		sn.runtime.sourceColorMap = sn.color.sourceColorMapping(sn.runtime.sourceGroupMap);
	
		// we make use of sn.colorFn, so stash the required color map where expected
		sn.runtime.colorData = sn.runtime.sourceColorMap.colorMap;

		// set up form-based details
		d3.select('#details .consumption').style('color', 
				sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Consumption'][sn.runtime.sourceGroupMap['Consumption'][0]]]);
		d3.select('#details .generation').style('color', 
				sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Generation'][sn.runtime.sourceGroupMap['Generation'][0]]]);

		// create copy of color data for reverse ordering so labels vertically match chart layers
		sn.ui.colorDataLegendTable('#source-labels', sn.runtime.sourceColorMap.colorMap.slice().reverse(), legendClickHandler, function(s) {
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

	energyBarOverlapChartSetup(sn.runtime.reportableEndDate, sn.runtime.energyBarOverlapChart, sn.runtime.energyBarOverlapParameters);
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
				sn.runtime.consumptionUrlHelper = sn.api.node.nodeUrlHelper(sn.env[propName]);
				getAvailable = true;
			} else if ( propName === 'nodeId' ) {
				sn.runtime.urlHelper = sn.api.node.nodeUrlHelper(sn.env[propName]);
				getAvailable = true;
			} else if ( propName === 'sourceIds'|| propName === 'consumptionSourceIds' ) {
				getAvailable = true;
			} else if ( propName === 'scale' ) {
				sn.runtime.energyBarOverlapChart.scaleFactor('Generation', Number(sn.env[propName]));
				regenerateChart();
				return;
			} else if ( propName === 'consumptionScale' ) {
				sn.runtime.energyBarOverlapChart.scaleFactor('Consumption', Number(sn.env[propName]));
				regenerateChart();
				return;
			}
			if ( getAvailable ) {
				sn.api.node.availableDataRange(sourceSets(true), function(reportableInterval) {
					delete sn.runtime.sourceColorMap; // to regenerate
					setup(reportableInterval);
				});
			} else {
				energyBarOverlapChartSetup(sn.runtime.reportableEndDate, sn.runtime.energyBarOverlapChart, sn.runtime.energyBarOverlapParameters);
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
		var currAgg = sn.runtime.energyBarOverlapChart.aggregate();
		sn.runtime.energyBarOverlapParameters.aggregate = (currAgg === 'Hour' ? 'Day' : currAgg === 'Day' ? 'Month' : 'Hour');
		energyBarOverlapChartSetup(sn.runtime.reportableEndDate, sn.runtime.energyBarOverlapChart, sn.runtime.energyBarOverlapParameters);
		setTimeout(function() {
			me.classed('hit', false);
		}, 500);
		updateRangeSelection();
	});
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 108,
		sourceIds : 'Main',
		scale : 1,
		consumptionNodeId : 108,
		consumptionSourceIds : 'DB',
		consumptionScale : 1,
		minutePrecision : 10,
		numHours : 24,
		numDays : 7,
		numMonths : 4,
		numYears : 2,
		wiggle : false,
		linkOld : false
	});
	
	sn.runtime.wChartRefreshMs = sn.env.minutePrecision * 60 * 1000;

	sn.runtime.energyBarOverlapParameters = new sn.Configuration({
		aggregate : 'Hour',
		excludeSources : sn.runtime.excludeSources,
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false),
		wiggle : (sn.env.wiggle === 'true'),
		plotProperties : {Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	sn.runtime.energyBarOverlapContainer = d3.select(d3.select('#energy-bar-chart').node().parentNode);
	sn.runtime.energyBarOverlapChart = sn.chart.energyBarOverlapChart('#energy-bar-chart', sn.runtime.energyBarOverlapParameters)
		.scaleFactor({ 'Generation' : sn.env.scale, 'Consumption' : sn.env.consumptionScale })
		.dataCallback(chartDataCallback)
		.colorCallback(colorForDataTypeSource)
		.sourceExcludeCallback(sourceExcludeCallback);
	
	sn.runtime.urlHelper = sn.api.node.nodeUrlHelper(sn.env.nodeId);
	sn.runtime.consumptionUrlHelper = sn.api.node.nodeUrlHelper(sn.env.consumptionNodeId);

	setupUI();
	sn.api.node.availableDataRange(sourceSets(), function(reportableInterval) {
		setup(reportableInterval);
		if ( sn.runtime.refreshTimer === undefined ) {
			// refresh chart data on interval
			sn.runtime.refreshTimer = setInterval(function() {
				sn.api.node.availableDataRange(sourceSets(), function(repInterval) {
					var jsonEndDate = repInterval.eDate;
					if ( jsonEndDate.getTime() > sn.runtime.reportableEndDate.getTime() ) {
						setup(repInterval);
					}
				});
			}, sn.runtime.wChartRefreshMs);
		}
	});
}
