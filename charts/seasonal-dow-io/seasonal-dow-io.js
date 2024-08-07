/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-seasonal-dow-io 1.0.0
 */
sn.config.debug = true;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.excludeSources = new sn.Configuration();

function setupSeasonalDayOfWeekChart(container, chart, parameters, endDate, sourceMap) {
	var plotPropName = parameters.plotProperties[parameters.aggregate];
	var urlParams = { dataPath : 'a.wattHours' };
	
	sn.api.datum.multiLoader([
		sn.api.datum.loader(sourceMap['Consumption'], sn.runtime.consumptionUrlHelper, 
			null, null, parameters.aggregate).urlParameters(urlParams),
		sn.api.datum.loader(sourceMap['Generation'], sn.runtime.urlHelper, 
			null, null, parameters.aggregate).urlParameters(urlParams)
	]).callback(function(error, results) {
		if ( !(Array.isArray(results) && results.length === 2) ) {
			sn.log("Unable to load data for Energy Bar chart: {0}", error);
			return;
		}
		// note the order we call load dictates the layer order of the chart... each call starts a new layer on top of previous layers
		chart.reset()
			.load(results[0], 'Consumption')
			.load(results[1], 'Generation')
			.regenerate();
		sn.log("Seasonal DOW IO chart watt range: {0}", chart.yDomain());
		sn.log("Seasonal DOW IO chart time range: {0}", chart.xDomain());
		sn.ui.adjustDisplayUnits(container, 'Wh', chart.yScale());
	}).load();
}

function seasonalDayOfWeekChartSetup(endDate) {
	setupSeasonalDayOfWeekChart(
		sn.runtime.seasonalDayOfWeekContainer,
		sn.runtime.seasonalDayOfWeekChart,
		sn.runtime.seasonalDayOfWeekParameters,
		endDate,
		sn.runtime.sourceGroupMap);
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
	seasonalDayOfWeekChartSetup(sn.runtime.reportableEndDate);
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
			}
			if ( getAvailable ) {
				sn.api.node.availableDataRange(sourceSets(true), function(reportableInterval) {
					delete sn.runtime.sourceColorMap; // to regenerate
					setup(reportableInterval);
				});
			} else {
				seasonalDayOfWeekChartSetup(sn.runtime.reportableEndDate);
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
	
	// toggle hemispheres
	d3.select('#hemisphere-toggle').classed('clickable', true).on('click', function(d) {
		var me = d3.select(this);
		var south = me.classed('south');
		me.classed('south', !south);
		sn.runtime.seasonalDayOfWeekChart.northernHemisphere(south);
	});
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 108,
		sourceIds : 'Main',
		consumptionNodeId : 108,
		consumptionSourceIds : 'DB',
		northernHemisphere : 'false'
	});
	sn.runtime.chartRefreshMs = 10 * 60 * 1000;

	sn.runtime.seasonalDayOfWeekParameters = new sn.Configuration({
		aggregate : 'SeasonalDayOfWeek',
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false),
		plotProperties : {SeasonalDayOfWeek : 'wattHours'}
	});
	sn.runtime.seasonalDayOfWeekContainer = d3.select(d3.select('#seasonal-dow-chart').node().parentNode);
	sn.runtime.seasonalDayOfWeekChart = sn.chart.seasonalDayOfWeekLineChart('#seasonal-dow-chart', sn.runtime.seasonalDayOfWeekParameters);
	
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
			}, sn.runtime.chartRefreshMs);
		}
	});
}
