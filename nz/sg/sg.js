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

/**
 * Schoolgen school app. Displays a set of charts and data related to a single school.
 * 
 * @param {object} nodeUrlHelper - A {@link sn.datum.nodeUrlHelper} configured with the school's SolarNetwork node ID.
 * @param {string} barEnergyChartSelector - A CSS selector to display the energy bar chart within.
 * @param {string} pieEnergyChartSelector - A CSS selector to display the energy pie chart within.
 * @param {string} outdatedSelector - A CSS selector to display the stale data warning message within.
 * @param {string} totalGenerationSelector - A CSS selector to display the overall generation watt counter.
 * @param {string} totalCO2Selector - A CSS selector to display the overall CO2 kg counter.
 * @param {string} totalConsumptionSelector - A CSS selector to display the overall consumption watt counter.
 * @param {string} lifetimeGenerationSelector - A CSS selector to display the lifetime total generation watt counter.
 * @param {string} lifetimeConsumptionSelector - A CSS selector to display the lifetime total consumption watt counter.
 * @class
 */
var sgSchoolApp = function(nodeUrlHelper, barEnergyChartSelector, pieEnergyChartSelector, outdatedSelector, 
		totalGenerationSelector, totalCO2Selector, totalConsumptionSelector, 
		lifetimeGenerationSelector, lifetimeConsumptionSelector) {
	var self = { version : '1.0.0' };
	var urlHelper = nodeUrlHelper;

	// auto-refresh settings
	var refreshMs = 60000,
		refreshTimer;
	
	// configuration
	var consumptionSources = [],
		generationSources = [],
		forcedDisplayFactor = 1000,
		hours = 24,
		days = 7,
		months = 4,
		years = 24,
		co2GramsPerWattHour = 0.1949878,
		dataScaleFactors = { 'Consumption' : 1, 'Generation' : 1},
		endDate, // set to most recently available data date
		zoomStack = [], // stack of { data : [], range : { ... } } objects to jump back out from zoom-in
		displayRange; // { start : Date, end : Date }
	
	// charts
	var chartSourceGroupMap = { 'Consumption' : consumptionSources, 'Generation' : generationSources },
		chartSourceSets,
		chartSourceColorMap,
		chartSourceGroupColorMap = {},
		barEnergyChartParams,
		barEnergyChartContainer,
		barEnergyChart,
		barEnergyChartDataTypeOrder = ['Generation', 'Consumption'],
		barEnergyChartSourceColors,
		pieEnergyChartParams,
		pieEnergyChartContainer,
		pieEnergyChart;
		
	// range selection limits, adjust based on width of bar chart
	var barEnergyRangeLimits = { 'Month' : 4, 'Day' : 10, 'Hour' : 12 };
		
	// chart tooltips
	var chartTooltipDataFormat = d3.format(',.1f'),
		barEnergyChartTooltip = d3.select(barEnergyChartSelector+'-tooltip'),
		pieEnergyChartTooltip = d3.select(pieEnergyChartSelector+'-tooltip');
		
	// counters
	var totalGenerationCounterFlipper,
		totalCO2CounterFlipper,
		lifetimeGenerationCounter,
		lifetimeGenerationCounterFlipper,
		totalConsumptionCounterFlipper,
		lifetimeConsumptionCounter,
		lifetimeConsumptionCounterFlipper;
	
	/**
	 * Get or set the consumption source IDs.
	 * 
	 * @param {array|string} [value] the array of source ID values, or if a string a comma-delimited list of source ID values
	 * @return when used as a getter, the current source IDs, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function consumptionSourceIds(value) {
		if ( !arguments.length ) return consumptionSources;
		var array;
		if ( Array.isArray(value) ) {
			array = value;
		} else if ( typeof value === 'string' ) {
			array = value.split(/\s*,\s*/);
		}
		// we want to maintain our original array instance, so just repopulate with new values
		consumptionSources.length = 0;
		Array.prototype.push.apply(consumptionSources, array);
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
		var array;
		if ( Array.isArray(value) ) {
			array = value;
		} else if ( typeof value === 'string' ) {
			array = value.split(/\s*,\s*/);
		}
		// we want to maintain our original array instance, so just repopulate with new values
		generationSources.length = 0;
		Array.prototype.push.apply(generationSources, array);
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
		if ( !arguments.length ) return hours;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			hours = n;
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
		if ( !arguments.length ) return days;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			days = n;
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
		if ( !arguments.length ) return months;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			months = n;
		}
		return self;
	}
	
	/**
	 * Get or set the number of years to display for the Month aggregate level.
	 * 
	 * @param {number} [value] the number of years to display
	 * @return when used as a getter, the number of years, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function numYears(value) {
		if ( !arguments.length ) return years;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			years = n;
		}
		return self;
	}
	
	/**
	 * Get or set the a fixed display factor to use in charts, e.g. <code>1000</code> to use
	 * <b>kWh</b> for energy values. Pass <code>null</code> to clear the setting and allow
	 * the charts to adjust the display factor dynamically, based on the data.
	 * 
	 * @param {number} [value] the number of months to display
	 * @return when used as a getter, the fixed display factor (<code>undefined</code> when not set), otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function fixedDisplayFactor(value) {
		if ( !arguments.length ) return forcedDisplayFactor;
		var n = undefined;
		if ( value !== null ) {
			n = Number(value);
			if ( isNaN(n) || !isFinite(n) ) {
				n = undefined;
			}
		}
		forcedDisplayFactor = n;
		return self;
	}
	
	function dataScaleFactorValue(dataType, value) {
		var n;
		if ( value === undefined ) {
			return dataScaleFactors[dataType];
		}
		n = Number(value);
		if ( isNaN(n) || !isFinite(n) ) {
			n = 1;
		}
		dataScaleFactors[dataType] = value;
		return self;
	}
	
	/**
	 * Get or set the generation data scale factor, to multiply all generation data values by.
	 * 
	 * @param {number} [value] the generation scale factor to use
	 * @return when used as a getter, the generation data scale factor, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function generationDataScaleFactor(value) {
		return dataScaleFactorValue('Generation', value);
	}
	
	/**
	 * Get or set the consumption data scale factor, to multiply all consumption data values by.
	 * 
	 * @param {number} [value] the consumption scale factor to use
	 * @return when used as a getter, the consumption data scale factor, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function consumptionDataScaleFactor(value) {
		return dataScaleFactorValue('Consumption', value);
	}
	
	/**
	 * Start the application, after configured.
	 * 
	 * @return this object
	 * @memberOf sgSchoolApp
	 */
	function start() {
		setupCounters();
		chartRefresh();
		if ( refreshTimer === undefined ) {
			refreshTimer = setInterval(chartRefresh, refreshMs);
		}
		return self;
	}
	
	/* === Counter Support === */
	
	function setupCounters() {
		var flipperParams = {
			animate: false,
			format: d3.format('09d'),
			flipperWidth: 20
		};
		if ( !totalGenerationCounterFlipper && totalGenerationSelector ) {
			totalGenerationCounterFlipper = sn.ui.flipCounter(totalGenerationSelector, flipperParams);
			totalGenerationCounterFlipper.render();
		}
		if ( !totalCO2CounterFlipper && totalCO2Selector ) {
			totalCO2CounterFlipper = sn.ui.flipCounter(totalCO2Selector, flipperParams);
			totalCO2CounterFlipper.render();
		}
		if ( !lifetimeGenerationCounterFlipper && lifetimeGenerationSelector ) {
			lifetimeGenerationCounterFlipper = sn.ui.flipCounter(lifetimeGenerationSelector, flipperParams);
			lifetimeGenerationCounterFlipper.render();
		}
		if ( !lifetimeGenerationCounter ) {
			lifetimeGenerationCounter = sn.util.sumCounter(urlHelper)
				.sourceIds(generationSources)
				.callback(function(sum) {
					var totalKWattHours = sum / 1000;
					sn.log('{0} total generation kWh', totalKWattHours);
					if ( lifetimeGenerationCounterFlipper ) {
						lifetimeGenerationCounterFlipper.update(Math.round(totalKWattHours));
					}
				})
				.start();
		}

		if ( !totalConsumptionCounterFlipper && totalConsumptionSelector ) {
			totalConsumptionCounterFlipper = sn.ui.flipCounter(totalConsumptionSelector, flipperParams);
			totalConsumptionCounterFlipper.render();
		}
		if ( !lifetimeConsumptionCounterFlipper && lifetimeConsumptionSelector ) {
			lifetimeConsumptionCounterFlipper = sn.ui.flipCounter(lifetimeConsumptionSelector, flipperParams);
			lifetimeConsumptionCounterFlipper.render();
		}
		if ( !lifetimeConsumptionCounter ) {
			lifetimeConsumptionCounter = sn.util.sumCounter(urlHelper)
				.sourceIds(consumptionSources)
				.callback(function(sum) {
					var totalKWattHours = sum / 1000;
					sn.log('{0} total consumption kWh', totalKWattHours);
					if ( lifetimeConsumptionCounterFlipper ) {
						lifetimeConsumptionCounterFlipper.update(Math.round(totalKWattHours));
					}
				})
				.start();
		}
	}
	
	/* === Global Chart Support === */
	
	function findPosition(container) {
		var l = 0, t = 0;
		if ( container.offsetParent ) {
			do {
				l += container.offsetLeft;
				t += container.offsetTop;
			} while ( container = container.offsetParent );
		}
		return [l, t];
	}

	function chartRefresh() {
		var needsRedraw = false;
		if ( !barEnergyChart ) {
			barEnergyChart = barEnergyChartCreate();
			barEnergyChartContainer = d3.select(d3.select(barEnergyChartSelector).node().parentNode);
			needsRedraw = true;
		}
		if ( !pieEnergyChart ) {
			pieEnergyChart = pieEnergyChartCreate();
			pieEnergyChartContainer = d3.select(d3.select(pieEnergyChartSelector).node().parentNode);
			needsRedraw = true;
		}
		if ( displayRange && displayRange.end < endDate ) {
			if ( needsRedraw ) {
				chartLoadData();
			}
			
			// hide the outdated warning message if we've selected a specific date range
			chartSetupOutdatedMessage();
		} else {
			needsRedraw = (needsRedraw || (endDate === undefined));
			sn.datum.availableDataRange(chartSetupSourceSets(), function(repInterval) {
				var jsonEndDate = repInterval.eDate;
				if ( needsRedraw || jsonEndDate > endDate ) {
					endDate = jsonEndDate;
					chartLoadData();
				}
				chartSetupOutdatedMessage(endDate);
			});
		}
	}
	
	function chartSetupOutdatedMessage(mostRecentDataDate) {
		// if the data is stale by an hour or more, display the "outdated" message
		var format;
		if ( mostRecentDataDate && new Date().getTime() - mostRecentDataDate.getTime() >= (1000 * 60 * 60) ) {
			format = d3.time.format('%d %b %Y %H:%M');
			d3.select(outdatedSelector).style('display', null).select('.value').text(format(mostRecentDataDate));
		} else {
			d3.select(outdatedSelector).style('display', 'none');
		}
	}
	
	function chartSetupSourceSets(regenerate) {
		if ( !chartSourceSets || regenerate ) {
			chartSourceSets = [
				{ nodeUrlHelper : urlHelper, 
					sourceIds : consumptionSources, 
					dataType : 'Consumption' },
				{ nodeUrlHelper : urlHelper, 
					sourceIds : generationSources, 
					dataType : 'Generation' }
			];
		}
		return chartSourceSets;
	}

	function chartSetupColorMap() {
		if ( chartSourceColorMap ) {
			return;
		}

		chartSourceColorMap = sn.sourceColorMapping(chartSourceGroupMap);
		
		Object.keys(chartSourceGroupMap).forEach(function(dataType) {
			// assign the data type the color of the first available source within that data type group
			var color = chartSourceColorMap.colorMap[chartSourceColorMap.displaySourceMap[dataType][chartSourceGroupMap[dataType][0]]];
			if ( color ) {
				chartSourceGroupColorMap[dataType] = color;
			}
		});
		
		barEnergyChartSourceColors = barEnergyChartSourceLabelsColors(chartSourceGroupMap, chartSourceColorMap);
		
		barEnergyChartSetupTooltip(barEnergyChartSelector+'-tooltip .source-labels', chartSourceGroupMap, barEnergyChartSourceColors, chartSourceColorMap);
		
		return chartSourceColorMap;
	}
	
	function chartColorForDataTypeSource(dataType, sourceId, sourceIndex) {
		if ( !chartSourceColorMap ) {
			return (dataType === 'Consumption' ? '#00c' : '#0c0');
		}
		var mappedSourceId = chartSourceColorMap.displaySourceMap[dataType][sourceId];
		return chartSourceColorMap.colorMap[mappedSourceId];
	}
	
	function forcedDisplayFactorFn() {
		return (forcedDisplayFactor > 0 ? function() { 
			return forcedDisplayFactor;
		} : null);
	}
	
	function chartDataCallback(dataType, datum) {
		// create date property
		datum.date = sn.datum.datumDate(datum);
	}
	
	function chartQueryRange() {
		var range = displayRange;
		if ( !range ) {
			range = sn.datum.loaderQueryRange(barEnergyChartParams.aggregate, 
				{ numHours : hours, numDays : days, numMonths : months, numYears : years}, 
				(endDate ? endDate : new Date()));
		}
		return range;
	}
	
	function chartRegenerate(chart, container, tooltipContainer) {
		var scale;
		if ( !chart ) {
			return;
		}
		chart.regenerate();
		scale = (chart.yScale ? chart.yScale() : chart.scale());
		sn.adjustDisplayUnits(container, 'Wh', scale, 'energy');
		if ( tooltipContainer ) {
			sn.adjustDisplayUnits(tooltipContainer, 'Wh', scale, 'energy');
		}
	}
	
	function chartInfos() {
		return [
			{ chart : barEnergyChart, container : barEnergyChartContainer, tooltipContainer : barEnergyChartTooltip },
			{ chart : pieEnergyChart, container : pieEnergyChartContainer, tooltipContainer : pieEnergyChartTooltip }
			
		];
	}
	
	function chartShowTotalWattHourCounts(totals) {
		if ( totalGenerationCounterFlipper ) {
			totalGenerationCounterFlipper.update(Math.round(totals['Generation'] / 1000));
		}
		if ( totalCO2CounterFlipper ) {
			totalCO2CounterFlipper.update(Math.round(totals['Generation'] * co2GramsPerWattHour / 1000));
		}
		if ( totalConsumptionCounterFlipper ) {
			totalConsumptionCounterFlipper.update(Math.round(totals['Consumption'] / 1000));
		}
	}
	
	function chartShowData(sourceSets, queryRange, results) {
		// sum up both generation and consumption over the shown date range
		var totalWhs = {};

		d3.select('.watthour-chart .time-count').text(queryRange.timeCount);
		d3.select('.watthour-chart .time-unit').text(queryRange.timeUnit);
		
		chartInfos().forEach(function(chartInfo, chartIndex) {
			chartInfo.chart.reset();
			sourceSets.forEach(function(sourceSet, i) {
				var totalWh;
				chartInfo.chart.load(results[i], sourceSet.dataType);
				if ( chartIndex === 0 ) {
					totalWh = d3.sum(results[i], function(d) { return d.wattHours; });
					if ( totalWhs[sourceSet.dataType] === undefined ) {
						totalWhs[sourceSet.dataType] = 0;
					}
					totalWhs[sourceSet.dataType] += totalWh;
				}
			});
			chartRegenerate(chartInfo.chart, chartInfo.container, chartInfo.tooltipContainer);
		});
		
		chartShowTotalWattHourCounts(totalWhs);
	}
	
	function areQueryRangesEqual(r1, r2) {
		return (r1 && r2 
			&& r1.start && r2.start && r1.start.getTime() === r2.start.getTime()
			&& r1.end && r2.end && r1.end.getTime() === r2.end.getTime());
	}
	
	function chartLoadData() {
		chartSetupColorMap();
		var sourceSets = chartSetupSourceSets();
		var queryRange = chartQueryRange();
		var aggregate = barEnergyChartParams.aggregate;
		var plotPropName = barEnergyChartParams.plotProperties[aggregate];
		var loadSets = sourceSets.map(function(sourceSet) {
			return sn.datum.loader(sourceSet.sourceIds, sourceSet.nodeUrlHelper, queryRange.start, queryRange.end, aggregate);
		});
		sn.datum.multiLoader(loadSets).callback(function(error, results) {
			if ( !(Array.isArray(results) && results.length === 2) ) {
				sn.log("Unable to load data for charts: {0}", error);
				return;
			}
			
			// handle pushing this data onto the range stack, if for a different data set, otherwise update this set
			var zoomStackTop = (zoomStack.length > 0 ? zoomStack[zoomStack.length - 1] : undefined);
			if ( zoomStackTop === undefined
					|| zoomStackTop.aggregate !== aggregate
					|| areQueryRangesEqual(zoomStackTop.range, queryRange) !== true ) {
				// push new item onto stack
				zoomStackTop = {};
				zoomStack.push(zoomStackTop);
			}
			
			zoomStackTop.aggregate = aggregate;
			zoomStackTop.range = queryRange;
			zoomStackTop.data = results;

			chartShowData(sourceSets, queryRange, results);
		}).load();
	}
	
	/* === Bar Energy Chart Support === */
	
	function barEnergyChartCreate() {
		var chart = sn.chart.energyIOBarChart(barEnergyChartSelector, barEnergyChartParams)
			.dataCallback(chartDataCallback)
			.colorCallback(chartColorForDataTypeSource)
			.scaleFactor(dataScaleFactors)
			.displayFactorCallback(forcedDisplayFactorFn())
			.showSumLine(false)
			.hoverEnterCallback(barEnergyHoverEnter)
			.hoverMoveCallback(barEnergyHoverMove)
			.hoverLeaveCallback(barEnergyHoverLeave)
			.rangeSelectionCallback(barEnergyRangeSelectionCallback)
			.doubleClickCallback(barEnergyDoubleClick);
		return chart;
	}
	
	function barEnergyChartSetupTooltip(tableContainerSelector, sourceGroupMap, sourceColors, sourceColorMap) {
		var tbody,
			rows, 
			index = 0, 
			table = d3.select(tableContainerSelector);
		
		table.html(null);
		sn.colorDataLegendTable(tableContainerSelector, sourceColors, undefined, function(s) {
			s.html(function(d) {
				var sourceGroup = sourceColorMap.displaySourceObjects[d];
				sn.log('Got data type {0} source {1}', sourceGroup.dataType, sourceGroup.source);
				return '<span class="energy">0</span> <span class="unit">(kWh)</span>';
			});
		});
		tbody = table.select('tbody');
		rows = tbody.selectAll('tr');
		barEnergyChartDataTypeOrder.forEach(function(dataType) {
			var dataTypeSources = sourceGroupMap[dataType];
			var row, cell;
			index += dataTypeSources.length;
			// insert a sub-total row
			if ( index >= rows[0].length ) {
				row = tbody.append('tr');
			} else {
				row = tbody.insert('tr', function() { 
					return rows[0][index];
				});
			}
			row.classed('subtotal', true);
			cell = row.append('td').attr('colspan', '2');
			if ( dataTypeSources.length > 1 ) {
				cell.html('<span class="energy">0</span> <span class="unit">(kWh)</span>');
			}
		});
	
		// add grand total row
		tbody.append('tr').classed('total', true).html('<td colspan="2"><span class="label">Net:</span> <span class="energy">0</span> <span class="unit">(kWh)</span></td>');
	}
	
	function barEnergyChartSourceLabelsColors(sourceGroupMap, sourceColorMap) {
		var result = []; // { source : X, color: Y }
		// note we put generation first here, as we want this order explicitly to match the I/O bar chart
		barEnergyChartDataTypeOrder.forEach(function(dataType) {
			var dataTypeSources = sourceGroupMap[dataType];
			if ( dataType === 'Generation' ) {
				// reverse the order, to match the chart
				dataTypeSources = dataTypeSources.slice().reverse();
			}
			dataTypeSources.forEach(function(source) {
				var displaySource = sourceColorMap.displaySourceMap[dataType][source];
				result.push({ dataType: dataType, source : displaySource, color: sourceColorMap.colorMap[displaySource]});
			});
		});
		return result;
	}

	function barEnergyHoverEnter(svgContainer, point, data) {
		barEnergyChartTooltip.style('display', (data && data.dateUTC ? 'block' : 'none'));
	}
	
	function barEnergyHoverMove(svgContainer, point, data) {
		var chart = this,
			tooltip = barEnergyChartTooltip,
			tooltipRect = tooltip.node().getBoundingClientRect(),
			matrix = svgContainer.getScreenCTM().translate(data.x, Number(d3.select(svgContainer).attr('height'))),
			tooltipOffset = findPosition(tooltip.node().parentNode);
	
		var subTotalDataTypes = barEnergyChartDataTypeOrder.filter(function(dataType) { 
			var dataTypeSources = chartSourceGroupMap[dataType];
			return (dataTypeSources.length > 1);
		});
	
		var lastGroupDataType, groupCount = 0, netTotal = 0;

		// position the tooltip below the chart, centered horizontally at the mouse position
		tooltip.style('left', Math.round(window.pageXOffset - tooltipOffset[0] + matrix.e - tooltipRect.width / 2) + 'px')
				.style('top', Math.round(window.pageYOffset - tooltipOffset[1] + matrix.f) + 'px')
				.style('display', (data && data.dateUTC ? 'block' : 'none'));
		
		tooltip.select('h3').text(sn.dateTimeFormat(data.date));
		tooltip.selectAll('td.desc span.energy').data(barEnergyChartSourceColors).text(function(d, i) {
			var index = i, sourceMap,
				groupData = data.groups[d.dataType],
				dataValue;
			if ( groupData.groupId !== lastGroupDataType ) {
				groupCount = i;
				lastGroupDataType = groupData.groupId;
			}
			index -= groupCount;
			dataValue = (index < groupData.data.length ? groupData.data[index] : null);
			if ( groupData.negate ) {
				netTotal -= dataValue;
			} else {
				netTotal += dataValue;
			}
			return chartTooltipDataFormat(dataValue / chart.yScale());
		});
	
		// fill in subtotals
		tooltip.selectAll('tr.subtotal span.energy').data(subTotalDataTypes).text(function(dataType) {
			var groupData = data.groups[dataType].data,
				sum = d3.sum(groupData);
			return chartTooltipDataFormat(sum / chart.yScale());
		});
	
		// fill in net total
		tooltip.select('tr.total')
				.style('color', chartSourceGroupColorMap[netTotal < 0 ? 'Consumption' : 'Generation'])
		.select('span.energy')
			.text(chartTooltipDataFormat(netTotal / chart.yScale()));
	}
	
	function barEnergyHoverLeave() {
		barEnergyChartTooltip.style('display', 'none');
	}
	
	function barEnergyDoubleClick(path, point, data) {
		if ( !(data && data.dateUTC) ) {
			return;
		}
		var chart = this,
			agg = chart.aggregate(),
			clickedDate = sn.timestampFormat.parse(data.dateUTC),
			zoomOut = (sn.hasTouchSupport ? d3.event.changedTouches && d3.event.changedTouches.length > 1 : d3.event.altKey),
			destAgg = agg,
			destDisplayRange,
			destZoomItem;
		
		if ( zoomOut && zoomStack.length > 1 ) {
			// pop off the stack
			destZoomItem = zoomStack[zoomStack.length - 2];
			zoomStack.length -= 1;
			destAgg = destZoomItem.aggregate;
			destDisplayRange = destZoomItem.range;
		} else {
			if ( agg === 'Month' ) {
				// zoom to just the month, at Day aggregate
				destAgg = 'Day';
				destDisplayRange = {
					start : clickedDate,
					end : d3.time.month.offset(clickedDate, 1),
					timeCount : 1,
					timeUnit : 'month'
				};
			} else if ( agg === 'Day' ) {
				// zoom to just day, at Hour aggregate
				destAgg = 'Hour';
				destDisplayRange = {
					start : clickedDate,
					end : d3.time.day.offset(clickedDate, 1),
					timeCount : 1,
					timeUnit : 'day'
				};
			} else if ( agg === 'Hour' ) {
				// zoom to just hour, at FiveMinute aggregate
				destAgg = 'FiveMinute';
				destDisplayRange = {
					start : clickedDate,
					end : d3.time.hour.offset(clickedDate, 1),
					timeCount : 1,
					timeUnit : 'hour'
				};
			}
		}
		
		if ( destDisplayRange ) {
			barEnergyChartParams.value('aggregate', destAgg);
			pieEnergyChartParams.value('aggregate', destAgg);
			displayRange = destDisplayRange;
			barEnergyHoverLeave();
			if ( destZoomItem ) {
				chartShowData(chartSetupSourceSets(), destZoomItem.range, destZoomItem.data);
				if ( zoomStack.length < 2 ) {
					// when we pop back to top of stack, reset date range to most available for data
					displayRange = undefined;
				}
			} else {
				chartLoadData();
			}
		}
	}
	
	function formatMinutesAsTimeUnit(minutes) {
		var hours = Math.floor(minutes / 60),
			minutes = (minutes - hours * 60);
		return ((hours > 0 ? hours +'h, ' : '') + (minutes !== 0 ? minutes +'m' : ''));
	}
		
	function barEnergyRangeSelectionCallback(path, point, dataArray) {
		var zoom = (dataArray 
					&& dataArray.length > 1 
					&& dataArray.every(function(d) { return d.dateUTC !== undefined; }) 
					&& (sn.hasTouchSupport || d3.event.shiftKey) ),
			chart = this,
			agg = chart.aggregate(),
			startingDate,
			endingDate,
			destAgg = agg,
			destDisplayRange;

		if ( !zoom ) {
			return;
		}
		
		startingDate = sn.timestampFormat.parse(dataArray[0].dateUTC),
		endingDate = sn.timestampFormat.parse(dataArray[1].dateUTC),
		destDisplayRange = { start : startingDate, timeCount : (dataArray[1].index - dataArray[0].index + 1) };
		
		if ( agg === 'Month' ) {
			if ( destDisplayRange.timeCount <= barEnergyRangeLimits[agg] ) {
				// zoom to selected days
				destAgg = 'Day';
			}
			destDisplayRange.end = d3.time.month.offset(endingDate, 1);
			destDisplayRange.timeUnit = 'month';
		} else if ( agg === 'Day' ) {
			if ( destDisplayRange.timeCount <= barEnergyRangeLimits[agg] ) {
				// zoom to just day, at Hour aggregate
				destAgg = 'Hour';
			}
			destDisplayRange.end = d3.time.day.offset(endingDate, 1);
			destDisplayRange.timeUnit = 'day';
		} else if ( agg === 'Hour' ) {
			if ( destDisplayRange.timeCount <= barEnergyRangeLimits[agg] ) {
				// zoom to just hour, at FiveMinute aggregate
				destAgg = 'FiveMinute';
			}
			destDisplayRange.end = d3.time.hour.offset(endingDate, 1);
			destDisplayRange.timeUnit = 'hour';
		} else if ( agg === 'FiveMinute' ) {
			destDisplayRange.end = d3.time.minute.offset(endingDate, 5);
			destDisplayRange.timeCount = formatMinutesAsTimeUnit(destDisplayRange.timeCount * 5);
			destDisplayRange.timeUnit = '';
		}

		if ( destDisplayRange.end ) {
			barEnergyChartParams.value('aggregate', destAgg);
			pieEnergyChartParams.value('aggregate', destAgg);
			displayRange = destDisplayRange;
			barEnergyHoverLeave();
			chartLoadData();
		}
	}
	
	/* === Pie Energy Chart Support === */
	
	function pieEnergyHoverEnter() {
		pieEnergyChartTooltip.style('display', 'block');
	}
	
	function pieEnergyHoverMove(path, point, data) {
		var chart = this,
			tooltip = pieEnergyChartTooltip,
			tooltipRect = tooltip.node().getBoundingClientRect(),
			matrix = data.centerContainer.getScreenCTM().translate(data.center[0] + data.labelTranslate[0], data.center[1] + data.labelTranslate[1]),
			sourceDisplay = chartSourceColorMap.displaySourceMap[data.groupId][data.sourceId],
			color = chartSourceColorMap.colorMap[sourceDisplay],
			descCell = tooltip.select('td.desc'),
			netCell = tooltip.select('tr.total td'),
			adjustL = 0,
			adjustT = 0,
			degrees = data.degrees,
			tooltipOffset = findPosition(tooltip.node().parentNode);
		
		// adjust for left/right/top/bottom of circle
		if ( degrees > 270 ) {
			// top left
			adjustT = -tooltipRect.height;
			adjustL = -tooltipRect.width;
		} else if ( degrees > 180 ) {
			// bottom left
			adjustL = -tooltipRect.width;
		} else if ( degrees > 90 ) {
			// bottom right
			// nothing to adjust here
		} else {
			// top right
			adjustT = -tooltipRect.height;
		}
	
		// calculate net
		var netTotal = data.allData.reduce(function(prev, curr) {
			var v = curr.sum;
			if ( curr.groupId === 'Consumption' ) {
				v *= -1;
			}
			return prev + v;
		}, 0);
	
		// position the tooltip at the center of the slice, outside the pie radius
		tooltip.style('left', Math.round(window.pageXOffset  - tooltipOffset[0] + matrix.e + adjustL ) + 'px')
			.style('top', Math.round(window.pageYOffset - tooltipOffset[1] + matrix.f + adjustT) + 'px');
			
		tooltip.select('h3').text(sourceDisplay);
		tooltip.select('.swatch').style('background-color', color);
		descCell.select('.percent').text(data.percentDisplay);
		descCell.select('.energy').text(data.valueDisplay);
		tooltip.select('tr.total').style('color', chartSourceGroupColorMap[netTotal < 0 ? 'Consumption' : 'Generation'])
		netCell.select('.energy').text(chartTooltipDataFormat(netTotal / chart.scale()));
	}
	
	function pieEnergyHoverLeave() {
		pieEnergyChartTooltip.style('display', 'none');
	}
	
	function pieEnergyChartCreate() {
		var chart = sn.chart.energyIOPieChart(pieEnergyChartSelector, pieEnergyChartParams)
			.colorCallback(chartColorForDataTypeSource)
			.scaleFactor(dataScaleFactors)
			.displayFactorCallback(forcedDisplayFactorFn())
			.hoverEnterCallback(pieEnergyHoverEnter)
			.hoverMoveCallback(pieEnergyHoverMove)
			.hoverLeaveCallback(pieEnergyHoverLeave);			
		return chart;
	}
	
	/** === Initialization === */
	
	function init() {
		barEnergyChartParams = new sn.Configuration({
			// bar chart properties
			northernHemisphere : false,
			padding : [20, 0, 34, 40],

			// global chart properties
			aggregate : 'Month',
			plotProperties : {FiveMinute : 'wattHours', Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
		});
		pieEnergyChartParams = new sn.Configuration({
			// pie chart properties
			innerRadius : 40,
			hideValues : true,
			
			// global chart properties
			aggregate : 'Month',
			plotProperties : {FiveMinute : 'wattHours', Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
		});
		Object.defineProperties(self, {
			consumptionSourceIds 		: { value : consumptionSourceIds },
			generationSourceIds 		: { value : generationSourceIds },
			consumptionDataScaleFactor 	: { value : consumptionDataScaleFactor },
			generationDataScaleFactor 	: { value : generationDataScaleFactor },
			numHours					: { value : numHours },
			numDays						: { value : numDays },
			numMonths					: { value : numMonths },
			numYears					: { value : numYears },
			fixedDisplayFactor			: { value : fixedDisplayFactor },
			start 						: { value : start }
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
			numDays : 5,
			numMonths : 12,
			numYears : 1,
			fixedDisplayFactor : 1000,
			sourceIds : 'Solar',
			consumptionSourceIds : 'DB',
			barEnergySelector : '#energy-bar-chart',
			pieEnergySelector : '#energy-pie-chart',
			outdatedSelector : '#chart-outdated-msg',
			totalGenerationSelector : '#generation-counter-flipboard',
			totalCO2Selector : '#co2-counter-flipboard',
			totalConsumptionSelector : '#consumption-counter-flipboard',
			lifetimeGenerationSelector : '#lifetime-generation-counter-flipboard',
			lifetimeConsumptionSelector : '#lifetime-consumption-counter-flipboard'
		});
	}
	
	urlHelper = sn.datum.nodeUrlHelper(env.nodeId, { tls : sn.config.tls, host : sn.config.host });

	app = sgSchoolApp(urlHelper, env.barEnergySelector, env.pieEnergySelector, env.outdatedSelector, 
			env.totalGenerationSelector, env.totalCO2Selector, env.totalConsumptionSelector,
			env.lifetimeGenerationSelector, env.lifetimeConsumptionSelector)
		.generationSourceIds(env.sourceIds)
		.consumptionSourceIds(env.consumptionSourceIds)
		.numHours(env.numHours)
		.numDays(env.numDays)
		.numMonths(env.numMonths)
		.numYears(env.numYears)
		.fixedDisplayFactor(env.fixedDisplayFactor)
		.start();
	
	return app;
}

sn.runtime.sgSchoolApp = startApp;

}(window));
