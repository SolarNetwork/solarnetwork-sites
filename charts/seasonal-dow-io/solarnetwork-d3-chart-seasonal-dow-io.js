/**
 * @require d3 3.0
 * @require solarnetwork-d3 0.0.3
 */
(function() {
'use strict';

if ( sn.chart === undefined ) {
	sn.chart = {};
}

/**
 * @typedef sn.chart.seasonalDayOfWeekLineChartParameters
 * @type {sn.Configuration}
 * @property {number} [width=812] - desired width, in pixels, of the chart
 * @property {number} [height=300] - desired height, in pixels, of the chart
 * @property {number[]} [padding=[30, 0, 30, 30]] - padding to inset the chart by, in top, right, bottom, left order
 * @property {number} [transitionMs=600] - transition time
 * @property {number} [ruleOpacity] - the maximum opacity to render rules at, during transitions
 * @property {number} [vertRuleOpacity] - the maximum opacity to render rules at, during transitions
 * @property {string[]} [seasonColors] - array of color values for spring, summer, autumn, and winter
 * @property {sn.Configuration} excludeSources - the sources to exclude from the chart
 */

/**
 * An energy input and output chart designed to show consumption and generation data simultaneously
 * grouped by hours per day, per season.
 * 
 * @class
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.seasonalDayOfWeekLineChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.seasonalDayOfWeekLineChart}
 */
sn.chart.seasonalDayOfWeekLineChart = function(containerSelector, chartConfig) {
	var parent = sn.chart.baseGroupedChart(containerSelector, chartConfig),
		superDraw = sn.superMethod.call(parent, 'draw');
	var self = (function() {
		var	me = sn.util.copy(parent);
		Object.defineProperty(me, 'version', {value : '1.0.0', enumerable : true, configurable : true});
		return me;
	}());
	parent.me = self;
	
	// one name for consumption, one for generation
	var layerNames = ['Consumption', 'Generation'];
	
	var sourceIdDataTypeMap = {Consumption : 'Consumption', Power : 'Generation'};
	
	// Array of string color values representing spring, summer, autumn, winter
	var seasonColors;
	
	// Boolean, true for northern hemisphere seasons, false for southern.
	var northernHemisphere;

	// object keys define group IDs to treat as "negative" or consumption values, below the X axis
	var negativeGroupMap = { Consumption : true };

	var rawData;
	var groupLayers;

	var linePathGenerator = d3.svg.line()
		.interpolate('monotone')
		.x(function(d) {
			return parent.x(d.date); 
		})
		.y(function(d) { return parent.y(d.y) - 0.5; });

	// x-domain is static as day-of-week
	//parent.x.domain(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

	function seasonColorFn(d, i) {
		var seasonColors = (parent.config.seasonColors || ['#5c8726', '#e9a712', '#762123', '#80a3b7']);
		var season = ((i + (northernHemisphere ? 0 : 2)) % 4);
		return seasonColors[season];
	}
	
	function labelSeasonColors(d) {
		if ( parent.aggregate() === 'Month' ) {
			return seasonColorFn(d);
		}
		return null;
	}
	
	function dayOfWeekDate(offset) {
		return new Date(Date.UTC(2001, 0, 1 + offset));
	}
		
	/**
	 * A rollup function for d3.dest(), that aggregates the plot property value and 
	 * returns objects in the form <code>{ date : Date(..), y : Number, plus : Number, minus : Number }</code>.
	 */
	function nestRollupAggregateSum(array) {
		// Note: we don't use d3.sum here because we want to end up with a null value for "holes"
		var sum = null, plus = null, minus = null, 
			d, v, i, len = array.length, groupId, negate = false,
			minX, maxX,
			maxNegativeY, maxPositiveY;

		for ( i = 0; i < len; i += 1 ) {
			d = array[i];
			groupId = d[parent.internalPropName].groupId;
			
			// ignore excluded sources...
			if ( parent.sourceExcludeCallback() && parent.sourceExcludeCallback().call(me, groupId, d.sourceId) ) {
				continue;
			}

			v = d[parent.plotPropertyName];
			if ( v !== undefined ) {
				negate = negativeGroupMap[groupId] === true;
				if ( negate ) {
					minus += v;
				} else {
					plus += v;
				}
			}
			if ( d.date ) {
				if ( minX === undefined || d.date.getTime() < minX.getTime() ) {
					minX = d.date;
				}
				if ( maxX === undefined || d.date.getTime() > maxX.getTime() ) {
					maxX = d.date;
				}
			}
		}
		if ( plus !== null || minus !== null ) {
			sum = plus - minus;
		}
		return { date : dayOfWeekDate(array[0].dow), y : sum, plus : plus, minus : minus, 
			season: array[0].season, 
			groupId : array[0][parent.internalPropName].groupId };
	}
	
	function setup() {
		var plotPropName = parent.plotPropertyName,
			groupIds = parent.groupIds,
			rangeX = [new Date(), new Date()],
			rangeY = [0, 0];
		
		groupLayers = {};

		groupIds.forEach(function(groupId) {
			var dummy,
				layerData,
				rawGroupData = parent.data(groupId),
				layerValues,
				range;
			if ( !rawGroupData || !rawGroupData.length > 1 ) {
				return;
			}
			
			layerData = d3.nest()
				.key(function(d) {
					if ( !d.hasOwnProperty(parent.internalPropName) ) {
						d[parent.internalPropName] = { groupId : groupId };
						if ( parent.dataCallback() ) {
							parent.dataCallback().call(me, groupId, d);
						} else {
							// automatically create Date
							d.date = sn.datum.datumDate(d);
						}
						d.season = sn.seasonForDate(d.date);
						d.dow = ((d.date.getUTCDay() + 6) % 7); // group into DOW, with Monday as 0
					}
					
					return d.season;
				})
				.key(function(d) {
					return d.dow;
				})
				.sortKeys(d3.ascending)
				.rollup(nestRollupAggregateSum)
				.entries(rawGroupData);
			
			if ( layerData.length < 1 ) {
				return;
			}
			
			if ( parent.layerPostProcessCallback() ) {
				layerData = parent.layerPostProcessCallback().call(me, groupId, layerData);
			}
			
			groupLayers[groupId] = layerData;
			
			// calculate min/max values
			layerValues = layerData.reduce(function(prev, d) {
				return prev.concat(d.values.map(function(d) { return d.values; }));
			}, []);
			
			range = d3.extent(layerValues, function(d) { return d.y; });
			if ( range[0] < rangeY[0] ) {
				rangeY[0] = range[0];
			}
			if ( range[1] > rangeY[1] ) {
				rangeY[1] = range[1];
			}
			
			range = d3.extent(layerValues, function(d) { return d.date.getTime(); });
			if ( range[0] < rangeX[0].getTime() ) {
				rangeX[0] = new Date(range[0]);
			}
			if ( range[1] < rangeX[1].getTime() ) {
				rangeX[1] = new Date(range[1]);
			}
		});
		
		// setup X domain
		parent.x.domain(rangeX);
		
		// setup Y domain
		parent.y.domain(rangeY).nice();
		
		parent.computeUnitsY();
	}
	
	function axisXVertRule(d) {
		return (Math.round(x(d) + 0.5) - 0.5);
	}
	
	function adjustAxisX() {
		var ticks = x.domain();
		adjustAxisXTicks(ticks);
		adjustAxisXRules(ticks);
	}
	
	function adjustAxisXTicks(ticks) {
		// Add hour labels, centered within associated band
		var labels = svgTickGroupX.selectAll("text").data(ticks);

		labels.transition().duration(transitionMs)
		  	.attr("x", axisXVertRule)
		  	.text(Object);
		
		labels.enter().append("text")
			.attr("dy", "-0.5em") // needed so descenders not cut off
			.style("opacity", 1e-6)
			.attr("x", axisXVertRule)
		.transition().duration(transitionMs)
				.style("opacity", 1)
				.text(Object)
				.each('end', function() {
						// remove the opacity style
						d3.select(this).style("opacity", null);
					});
		
		labels.exit().transition().duration(transitionMs)
			.style("opacity", 1e-6)
			.remove();
	}
	
	function adjustAxisXRules(vertRuleTicks) {
		var axisLines = svgRoot.select("g.vertrule").selectAll("line").data(vertRuleTicks);
		axisLines.transition().duration(transitionMs)
	  		.attr("x1", axisXVertRule)
	  		.attr("x2", axisXVertRule);
		
		axisLines.enter().append("line")
			.style("opacity", 1e-6)
			.attr("x1", axisXVertRule)
	  		.attr("x2", axisXVertRule)
	  		.attr("y1", 0)
	  		.attr("y2", h + 10)
		.transition().duration(transitionMs)
			.style("opacity", vertRuleOpacity)
			.each('end', function() {
				// remove the opacity style
				d3.select(this).style("opacity", null);
			});
		
		axisLines.exit().transition().duration(transitionMs)
			.style("opacity", 1e-6)
			.remove();
	}
	
	function setupDrawData() {
		var groupedData = [[],[],[],[]],
			groupIds = parent.groupIds;

		// construct a 3D array of our data, to achieve a group/source/datum hierarchy;
		groupIds.forEach(function(groupId) {
			var groupLayer = groupLayers[groupId];
			if ( groupLayer ) {
				groupLayer.forEach(function(seasonData) {
					var season = Number(seasonData.key);
					groupedData[season].push(seasonData.values.map(function(d) {
						return d.values;
					}));
				});
			}
		});
		
		return {
			groupedData : groupedData
		};
	}
	
	function draw() {
		var groupIds = parent.groupIds,
			transitionMs = parent.transitionMs(),
			seasons,
			lines,
			centerYLoc,
			drawData;
			
		drawData = setupDrawData();

		// we create groups for each season
		seasons = parent.svgDataRoot.selectAll('g.season').data(drawData.groupedData);
		
		seasons.enter().append('g')
			.attr('class', 'season')
			.style('stroke', seasonColorFn);
				
		lines = seasons.selectAll('path.line').data(Object, function(d, i) {
			return d[0].groupId;
		});
		
		lines.transition().duration(transitionMs)
				.attr('d', linePathGenerator);
		
		lines.enter().append('path')
				.classed('line', true)
				.attr('d', linePathGenerator);
		
		lines.exit().transition().duration(transitionMs)
			.style('opacity', 1e-6)
			.remove();
		
		superDraw();
	}

	/**
	 * Get/set the x-axis domain (days of the week). You can use a different language by
	 * setting the domain to something else.
	 * 
	 * @param {String[]} [value] the 7 day of week names
	 * @return if used as a getter an array with the days of the weeks, which are used as labels,
	 *         otherwise this object
	 * @memberOf sn.chart.seasonalDayOfWeekLineChart
	 */
	self.xDomain = function(value) { 
		if ( !arguments.length ) return parent.x.domain();
		parent.x.domain(value);
		return parent.me;
	};

	/**
	 * Toggle between nothern/southern hemisphere seasons, or get the current setting.
	 * 
	 * @param {boolean} [value] <em>true</em> for northern hemisphere seasons, <em>false</em> for sothern hemisphere
	 * @returns when used as a getter, the current setting
	 * @memberOf sn.chart.seasonalDayOfWeekLineChart
	 */
	self.northernHemisphere = function(value) {
		if ( !arguments.length ) return northernHemisphere;
		if ( value === northernHemisphere ) {
			return;
		}
		northernHemisphere = (value === true);
		
		// immediately update path colors
		parent.svgDataRoot.selectAll('g.season').transition().duration(parent.transitionMs())
			.style('stroke', seasonColorFn);

		return parent.me;
	};
	
	/**
	 * Get or set an array of group IDs to treat as negative group IDs, that appear below
	 * the X axis.
	 *
	 * @param {Array} [value] the array of group IDs to use
	 * @return {Array} when used as a getter, the list of group IDs currently used, otherwise this object
	 * @memberOf sn.chart.energyIOBarChart
	 */
	self.negativeGroupIds = function(value) {
		if ( !arguments.length ) {
			return (function() {
				var prop,
					result = [];
				for ( prop in negativeGroupMap ) {
					if ( negativeGroupMap.hasOwnProperty(prop) ) {
						result.pus(prop);
					}
				}
				return result;
			}());
		}
		negativeGroupMap = {};
		value.forEach(function(e) {
			negativeGroupMap[e] = true;
		});
		return parent.me;
	};

	// override our setup funciton
	parent.setup = setup;
	
	// define our drawing function
	parent.draw = draw;
	
	return self;
};

}());
