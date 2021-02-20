/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-energy-io 1.0.0
 * @require solarnetwork-d3-chart-power-io 1.0.0
 */

sn.config.debug = true;
sn.runtime.config = {
	host: 'query.solarnetwork.net'
};
sn.runtime.configReading = {
	host: 'query.solarnetwork.net/1m'
};
sn.runtime.excludeSources = new sn.Configuration();

function colorForDataTypeSource(dataType, sourceId, sourceIndex) {
	if ( sn.env.showSources === 'true' ) {
		var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
		return sn.runtime.colorData[mappedSourceId];
	}
	return sn.runtime.sourceColorMap.colorMap[sourceId];
}

function sourceExcludeCallback(dataType, sourceId) {
	var mappedSourceId;
	if ( sn.env.showSources === 'true' ) {
		mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	} else {
		mappedSourceId = displayNameForDataType(dataType);
	}
	return (sourceId !== sn.env.pcmSourceId && sn.runtime.excludeSources.enabled(mappedSourceId));
}

function displayNameForDataType(dataType) {
	if ( sn.env.showSources === 'true' ) {
		return dataType;
	}
	return (dataType === 'Generation' ? 'Solar' : dataType);
}

function layerPostProcessCallback(dataType, layerData) {
	if ( sn.env.showSources === 'true' ) {
		return layerData;
	}
	return sn.api.datum.aggregateNestedDataLayers(layerData, dataType, ['date', '__internal__'], ['watts', 'wattHours'], 
		{sourceId : displayNameForDataType(dataType)});
}

function regenerateChart(container, chart, parameters) {
	chart.regenerate();
	sn.ui.adjustDisplayUnits(container, (parameters.aggregate === 'TenMinute' ? 'W' : 'Wh'), chart.yScale());
}

// handle clicks on legend handler
function legendClickHandler(d, i) {
	sn.runtime.excludeSources.toggle(d.source);
	if ( sn.runtime.powerAreaChart !== undefined ) {
		regenerateChart(
			sn.runtime.powerAreaContainer,
			sn.runtime.powerAreaChart,
			sn.runtime.powerAreaParameters);
	}
	if ( sn.runtime.energyBarChart !== undefined ) {
		regenerateChart(
			sn.runtime.energyBarContainer,
			sn.runtime.energyBarChart,
			sn.runtime.energyBarParameters);
	}
	if ( sn.runtime.overviewAreaChart !== undefined ) {
		regenerateChart(
			sn.runtime.overviewAreaContainer,
			sn.runtime.overviewAreaChart,
			sn.runtime.overviewAreaParameters);
	}
}

function setupGroupedLayerChart(container, chart, parameters, endDate, sourceMap) {
	var queryRange = sn.api.datum.loaderQueryRange(parameters.aggregate, sn.env, endDate);
	var plotPropName = parameters.plotProperties[parameters.aggregate];
	
	container.selectAll('.time-count').text(queryRange.timeCount);
	container.selectAll('.time-unit').text(queryRange.timeUnit);
	
	sn.api.datum.multiLoader([
		sn.api.datum.loader(sourceMap['Consumption'], sn.runtime.consumptionUrlHelper, 
			queryRange.start, queryRange.end, parameters.aggregate),
		sn.api.datum.loader(sourceMap['Generation'], sn.runtime.urlHelper, 
			queryRange.start, queryRange.end, parameters.aggregate)
	]).callback(function(error, results) {
		if ( !(Array.isArray(results) && results.length === 2) ) {
			sn.log("Unable to load data for chart: {0}", error);
			return;
		}
		// note the order we call load dictates the layer order of the chart... each call starts a new layer on top of previous layers
		chart.reset()
			.load(results[0], 'Consumption')
			.load(results[1], 'Generation')
			.regenerate();
		sn.ui.adjustDisplayUnits(container, (parameters.aggregate === 'TenMinute' ? 'W' : 'Wh'), chart.yScale());
	}).load();
}

function setupSeasonalEnergyChart(container, chart, parameters, endDate, sourceMap) {
	var plotPropName = parameters.plotProperties[parameters.aggregate];
	var urlParams = { dataPath : 'a.wattHours' };
	
	sn.api.datum.multiLoader([
		sn.api.datum.loader(sourceMap['Consumption'], sn.runtime.consumptionUrlHelper, 
			null, null, parameters.aggregate).urlParameters(urlParams),
		sn.api.datum.loader(sourceMap['Generation'], sn.runtime.urlHelper, 
			null, null, parameters.aggregate).urlParameters(urlParams)
	]).callback(function(error, results) {
		if ( !(Array.isArray(results) && results.length === 2) ) {
			sn.log("Unable to load data for seasonal chart: {0}", error);
			return;
		}
		// note the order we call load dictates the layer order of the chart... each call starts a new layer on top of previous layers
		chart.reset()
			.load(results[0], 'Consumption')
			.load(results[1], 'Generation')
			.regenerate();
		sn.ui.adjustDisplayUnits(container, 'Wh', chart.yScale());
	}).load();
}


function updateReadings() {
	d3.json(sn.runtime.readingUrlHelper.mostRecentURL(sn.runtime.sourceGroupMap['Generation']), function(json) {
		if ( !(json && json.data && Array.isArray(json.data.results)) ) {
			sn.log('No data available for node {0}', sn.runtime.urlHelper.nodeId);
			return;
		}
		// totalPower, in kW
		var totalPower = d3.sum(json.data.results, function(d) { 
			return (d.watts ? d.watts : 0);
		}) / 1000;
		d3.select('#total-power-value').html(Number(totalPower).toFixed(2));
		if ( sn.runtime.totalPowerGauge ) {
			sn.runtime.totalPowerGauge.update(totalPower);
		}
	});
}

function swapChart(direction) {
	if ( d3.select('.watthour-chart').classed('chart-in') ) {
		// swap visible aggregate level... until we've cycled through them all
		if ( direction !== undefined && direction < 0 ) {
			sn.runtime.energyBarParameters.aggregate = (sn.runtime.energyBarParameters.aggregate === 'Hour' 
				? 'Month' : sn.runtime.energyBarParameters.aggregate === 'Month' ? 'Day' : 'Hour');
		} else {
			sn.runtime.energyBarParameters.aggregate = (sn.runtime.energyBarParameters.aggregate === 'Hour' 
				? 'Day' : sn.runtime.energyBarParameters.aggregate === 'Day' ? 'Month' : 'Hour');
		}
		if ( sn.runtime.energyBarParameters.aggregate === 'Hour' ) {
			// we'll swap to W chart now, but switch this back to Hour for next time it appears
			setTimeout(function() {
				energyBarChartSetup();
			}, 3000);
		} else {
			energyBarChartSetup();
			return;
		}
	}
	var currIn = undefined;
	var charts = d3.selectAll('.charts > .chart');
	charts.each(function(d, i) {
		var chart = d3.select(this);
		var currOut =  (chart.classed('chart-out') || chart.classed('chart-waiting'));
		if ( !currOut && currIn === undefined ) {
			currIn = i;
		}
	});
	var nextIn = ((currIn + (direction !== undefined && direction < 0 ? (charts.size() - 1) : 1)) % charts.size());
	charts.each(function(d, i) {
		var chart = d3.select(this);
		if ( i === currIn ) {
			chart.classed({'chart-out':true, 'chart-in':false, 'chart-waiting':false});
		} else if ( i === nextIn ) {
			chart.style('opacity', 1e-6)
				.classed({'chart-out':false, 'chart-in':true, 'chart-waiting':false})
			.transition().duration(200)
				.style('opacity', 1);
		}
	});
}

function isAutomaticSwapChartEnabled() {
	return (sn.runtime.swapChartTimer !== undefined);
}

function enableAutomaticSwapChart() {
	if ( sn.runtime.swapChartTimer !== undefined ) {
		return;
	}
	sn.runtime.swapChartTimer = setInterval(swapChart,  sn.env.swapSeconds * 1000);
}

function disableAutomaticSwapChart() {
	if ( sn.runtime.swapChartTimer === undefined ) {
		return;
	}
	clearInterval(sn.runtime.swapChartTimer);
	delete sn.runtime.swapChartTimer;
}

function resetAutomaticSwapChart() {
	disableAutomaticSwapChart();
	enableAutomaticSwapChart();
}

function actionToggleAutomaticSwapChart() {
	var me = d3.select(this);
	var currEnabled = isAutomaticSwapChartEnabled();
	me.classed({'fa-pause' : !currEnabled, 'fa-play' : currEnabled});
	if ( currEnabled ) {
		disableAutomaticSwapChart();
	} else {
		enableAutomaticSwapChart();
	}
}

function resizeProps(parent) {
	var chartEl = undefined;
	while ( parent.parentNode ) {
		parent = parent.parentNode;
		chartEl = d3.select(parent);
		if ( chartEl.classed('chart') ) {
			break;
		}
	}
	if ( chartEl === undefined ) {
		return;
	}
	var chart;
	var min, max;
	var propName;
	if ( chartEl.classed('watt-chart') ) {
		chart = sn.runtime.powerAreaChart;
		propName = 'numHours';
		min = 1;
		max = 36;
	} else {
		// assume Wh chart
		chart = sn.runtime.energyBarChart;
		if ( sn.runtime.energyBarParameters.aggregate === 'Month' ) {
			propName = 'numYears';
			min = 1;
			max = 6;
		} else if ( sn.runtime.energyBarParameters.aggregate === 'Day' ) {
			propName = 'numMonths';
			min = 1;
			max = 8;
		} else {
			// assume Hour
			propName = 'numDays';
			min = 1;
			max = 10;
		}
	}
	return {chart:chart, propName:propName, min:min, max:max};
}

function sourceMapping(sourceMap) {
	var result,
		dataType;

	if ( sn.env.showSources === 'true' ) {
		result = sourceMap;
	} else {
		result = {};
		for ( dataType in sourceMap ) {
			if ( sourceMap.hasOwnProperty(dataType) ) {
				result[dataType] = ['Main'];
			}
		}
	}
	return result;
}

function setupSourceGroupMap() {
	var map = {},
		sourceArray;
	sourceArray = (Array.isArray(sn.env.sourceIds) ? sn.env.sourceIds : sn.env.sourceIds.split(/\s*,\s*/));
	map['Generation'] = sourceArray;
	
	sourceArray = (Array.isArray(sn.env.consumptionSourceIds) ? sn.env.consumptionSourceIds : sn.env.consumptionSourceIds.split(/\s*,\s*/));
	map['Consumption'] = sourceArray;
	
	sn.runtime.sourceGroupMap = map;
	sn.runtime.sourceMap = sourceMapping(map);
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

function overviewAreaChartSetup() {
	setupGroupedLayerChart(
		sn.runtime.overviewAreaContainer, 
		sn.runtime.overviewAreaChart, 
		sn.runtime.overviewAreaParameters, 
		sn.runtime.reportableEndDate, 
		sn.runtime.sourceGroupMap);
}

function powerAreaChartSetup() {
	setupGroupedLayerChart(
		sn.runtime.powerAreaContainer, 
		sn.runtime.powerAreaChart, 
		sn.runtime.powerAreaParameters, 
		sn.runtime.reportableEndDate, 
		sn.runtime.sourceGroupMap);
}

function energyBarChartSetup() {
	setupGroupedLayerChart(
		sn.runtime.energyBarContainer, 
		sn.runtime.energyBarChart, 
		sn.runtime.energyBarParameters, 
		sn.runtime.reportableEndDate, 
		sn.runtime.sourceGroupMap);
}

function seasonalHourOfDayChartSetup() {
	setupSeasonalEnergyChart(
		sn.runtime.seasonalHourOfDayContainer, 
		sn.runtime.seasonalHourOfDayChart, 
		sn.runtime.seasonalHourOfDayParameters, 
		sn.runtime.reportableEndDate, 
		sn.runtime.sourceGroupMap);
}

function seasonalDayOfWeekChartSetup() {
	setupSeasonalEnergyChart(
		sn.runtime.seasonalDayOfWeekContainer, 
		sn.runtime.seasonalDayOfWeekChart, 
		sn.runtime.seasonalDayOfWeekParameters, 
		sn.runtime.reportableEndDate, 
		sn.runtime.sourceGroupMap);
}

function setup(repInterval) {
	sn.runtime.reportableEndDate = repInterval.eDate;
	if ( sn.runtime.sourceColorMap === undefined ) {
		sn.runtime.sourceColorMap = sn.color.sourceColorMapping(sn.runtime.sourceMap, {
			displayDataType : displayNameForDataType
		});
	
		// we make use of sn.colorFn, so stash the required color map where expected
		sn.runtime.colorData = sn.runtime.sourceColorMap.colorMap;

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
	
	if ( sn.runtime.refreshReadingsTimer === undefined ) {
		// every minute update reading values
		updateReadings();
		sn.runtime.refreshReadingsTimer = setInterval(updateReadings, 60 * 1000);
	}

	// hide/show the data most-recent date
	setupOutdatedMessage(new Date(repInterval.endDateMillis));

	setupCounters();

	overviewAreaChartSetup();
	
	powerAreaChartSetup();
	
	energyBarChartSetup();

	seasonalHourOfDayChartSetup();
	
	seasonalDayOfWeekChartSetup();
}

function setupUI() {
	// setup power gauge
	sn.runtime.totalPowerGauge = sn.chart.gauge('#total-power-gauge', {
		size: 232,
		clipWidth: 232,
		clipHeight: 125,
		ringWidth: 40,
		maxValue: sn.env.maxPowerKW,
		majorTicks: sn.env.powerGaugeTicks,
		transitionMs: 4000,
		arcColorFn: d3.interpolateHsl(d3.rgb("#e8e2ca"), d3.rgb("#005231"))
	});
	sn.runtime.totalPowerGauge.render();

	// animate between charts every few seconds
	enableAutomaticSwapChart();
	
	// allow space key to toggle animations on/off
	d3.select("body").on("keydown", function(event) {
		if ( d3.event.keyCode === 32 ) {
			// spacebar
			actionToggleAutomaticSwapChart.call(d3.select('.actions .toggle-chartswap').node());
		} else if ( d3.event.keyCode === 37 ) {
			// left arrow, go to previous chart
			swapChart(-1);
			if ( isAutomaticSwapChartEnabled() ) {
				resetAutomaticSwapChart();
			}
		} else if ( d3.event.keyCode === 39 ) {
			// right arrow, go to next chart
			swapChart();
			if ( isAutomaticSwapChartEnabled() ) {
				resetAutomaticSwapChart();
			}
		}
	});
}

function setupCounters() {
	// flip counter for Wh generated
	if ( sn.runtime.flipCounterKWh === undefined ) {
		sn.runtime.flipCounterKWh = sn.ui.flipCounter('#counter-kwh', {
			animate: (sn.env.flipCounterAnimate === 'true'),
			format: d3.format('08d'),
			flipperWidth: 28
		});
		sn.runtime.flipCounterKWh.render();
	}

	// flip counter for Wh consumed
	if ( sn.runtime.flipCounterKWhConsumed === undefined ) {
		sn.runtime.flipCounterKWhConsumed = sn.ui.flipCounter('#counter-kwh-consume', {
			animate: (sn.env.flipCounterAnimate === 'true'),
			format: d3.format('08d'),
			flipperWidth: 28
		});
		sn.runtime.flipCounterKWhConsumed.render();
	}

	// Wh counter utility (generation)
	if ( sn.runtime.wattHourPowerCounter === undefined ) {
		sn.runtime.wattHourPowerCounter = sn.api.datum.sumCounter(sn.runtime.readingUrlHelper)
			.sourceIds(sn.env.sourceIds)
			.callback(function(sum) {
				var totalKWattHours = sum / 1000;
				sn.log('{0} total generation kWh', totalKWattHours);
				sn.runtime.flipCounterKWh.update(Math.round(totalKWattHours));
			})
			.start();
	}

	// Wh counter utility (consumption)
	if ( sn.runtime.wattHourConsumptionCounter === undefined ) {
		sn.runtime.wattHourConsumptionCounter = sn.api.datum.sumCounter(sn.runtime.consumptionReadingUrlHelper)
			.sourceIds(sn.env.consumptionSourceIds)
			.callback(function(sum) {
				var totalKWattHours = sum / 1000;
				sn.log('{0} total consumption kWh', totalKWattHours);
				sn.runtime.flipCounterKWhConsumed.update(Math.round(totalKWattHours));
			})
			.start();
	}
}

function setupOutdatedMessage(endDate) {
	// if the data is stale by an hour or more, display the "outdated" message
	var format;
	if ( new Date().getTime() - endDate.getTime() >= (1000 * 60 * 60) ) {
		format = d3.time.format('%d %b %Y %H:%M');
		d3.select('#outdated-msg').style('display', 'block').select('.value').text(format(endDate));
	} else {
		d3.select('#outdated-msg').style('display', 'none');
	}
}

function onDocumentReady() {
	var mainChartHeight = 780;
	
	sn.setDefaultEnv({
		nodeId : 433,
		sourceIds : 'SMAInverter1',
		consumptionNodeId : 433,
		consumptionSourceIds : 'Main',
		minutePrecision : 10,
		numHours : 24,
		numDays : 7,
		numMonths : 4,
		numYears : 1,
		wiggle : 'true',
		linkOld : 'false',
		maxPowerKW : 50,
		powerGaugeTicks : 4,
		swapSeconds : 20,
		northernHemisphere : 'false',
		flipCounterAnimate: 'false',
		showSumLines: 'false'
	});
	sn.runtime.refreshMs = sn.env.minutePrecision * 60 * 1000;

	sn.runtime.overviewAreaParameters = new sn.Configuration({
		height: 80,
		padding : [0, 0, 15, 0],
		aggregate : 'Month',
		wiggle : (sn.env.wiggle === 'true'),
		plotProperties : {Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	sn.runtime.overviewAreaContainer = d3.select(d3.select('#overview-chart').node().parentNode);
	sn.runtime.overviewAreaChart = sn.chart.powerAreaChart('#overview-chart', sn.runtime.overviewAreaParameters)
		.colorCallback(colorForDataTypeSource)
		.sourceExcludeCallback(sourceExcludeCallback)
		.layerPostProcessCallback(layerPostProcessCallback);
	
	sn.runtime.energyBarParameters = new sn.Configuration({
		height : mainChartHeight,
		aggregate : 'Hour',
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false),
		plotProperties : {Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	sn.runtime.energyBarContainer = d3.select(d3.select('#watthour-chart').node().parentNode);
	sn.runtime.energyBarChart = sn.chart.energyIOBarChart('#watthour-chart', sn.runtime.energyBarParameters)
		//.showSumLine(sn.env.showSumLines === 'true')
		.colorCallback(colorForDataTypeSource)
		.sourceExcludeCallback(sourceExcludeCallback)
		.layerPostProcessCallback(layerPostProcessCallback);

	sn.runtime.powerAreaParameters = new sn.Configuration({
		height : mainChartHeight,
		aggregate : 'TenMinute',
		plotProperties : {TenMinute : 'watts', Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	sn.runtime.powerAreaContainer = d3.select(d3.select('#watt-chart').node().parentNode);
	sn.runtime.powerAreaChart = sn.chart.powerIOAreaChart('#watt-chart', sn.runtime.powerAreaParameters)
		.showSumLine(sn.env.showSumLines === 'true')
		.colorCallback(colorForDataTypeSource)
		.sourceExcludeCallback(sourceExcludeCallback)
		.layerPostProcessCallback(layerPostProcessCallback);

	sn.runtime.seasonalHourOfDayParameters = new sn.Configuration({
		height : mainChartHeight,
		aggregate : 'SeasonalHourOfDay',
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false),
		plotProperties : {SeasonalHourOfDay : 'wattHours'}
	});
	sn.runtime.seasonalHourOfDayContainer = d3.select(d3.select('#seasonal-hod-chart').node().parentNode);
	sn.runtime.seasonalHourOfDayChart = sn.chart.seasonalHourOfDayLineChart('#seasonal-hod-chart', sn.runtime.seasonalHourOfDayParameters)
		.sourceExcludeCallback(sourceExcludeCallback);

	sn.runtime.seasonalDayOfWeekParameters = new sn.Configuration({
		height : mainChartHeight,
		aggregate : 'SeasonalDayOfWeek',
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false),
		plotProperties : {SeasonalDayOfWeek : 'wattHours'}
	});
	sn.runtime.seasonalDayOfWeekContainer = d3.select(d3.select('#seasonal-dow-chart').node().parentNode);
	sn.runtime.seasonalDayOfWeekChart = sn.chart.seasonalDayOfWeekLineChart('#seasonal-dow-chart', sn.runtime.seasonalDayOfWeekParameters)
		.sourceExcludeCallback(sourceExcludeCallback);

	sn.runtime.urlHelper = sn.api.node.nodeUrlHelper(sn.env.nodeId, sn.runtime.config);
	sn.runtime.readingUrlHelper = sn.api.node.nodeUrlHelper(sn.env.nodeId, sn.runtime.configReading);
	sn.runtime.consumptionUrlHelper = sn.api.node.nodeUrlHelper(sn.env.consumptionNodeId, sn.runtime.config);
	sn.runtime.consumptionReadingUrlHelper = sn.api.node.nodeUrlHelper(sn.env.consumptionNodeId, sn.runtime.configReading);

	sn.env.sourceIds = sn.env.sourceIds.split(/\s*,\s*/);
	sn.env.consumptionSourceIds = sn.env.consumptionSourceIds.split(/\s*,\s*/);

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
					} else {
						setupOutdatedMessage(jsonEndDate);
					}
				});
			}, sn.runtime.refreshMs);
		}
	});
}
