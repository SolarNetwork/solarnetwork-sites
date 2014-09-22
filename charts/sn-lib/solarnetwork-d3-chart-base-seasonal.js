/**
 * @require d3 3.0
 * @require solarnetwork-d3 0.0.4
 * @require solarnetwork-d3-chart-base 1.0.0
 */
(function() {
'use strict';

if ( sn.chart === undefined ) {
	sn.chart = {};
}

/**
 * An abstract base chart supporting seasonal aggregate groups.
 * 
 * @class
 * @extends sn.chart.baseGroupedChart
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {object} [chartConfig] - the chart parameters
 * @returns {sn.chart.baseGroupedSeasonalLineChart}
 */
sn.chart.baseGroupedSeasonalLineChart = function(containerSelector, chartConfig) {
	var parent = sn.chart.baseGroupedChart(containerSelector, chartConfig),
		superDraw = sn.superMethod.call(parent, 'draw'),
		superMakeExtend = sn.superMethod.call(parent, 'makeExtend');
	var self = (function() {
		var	me = sn.util.copy(parent);
		Object.defineProperty(me, 'version', {value : '1.0.0', enumerable : true, configurable : true});
		return me;
	}());
	parent.me = self;
	
	// extending classes should re-define this property so method chaining works
	Object.defineProperty(self, 'me', {
						enumerable : false,
						get : function() { return parent.me; },
						set : function(obj) { parent.me = obj; }
					});

	var timeKeyLabels = ['Midnight', 
						'1am', '2am', '3am', '4am', '5am', '6am', '7am', '8am', '9am', '10am', '11am',
						'Noon',
						'1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm', '10pm', '11pm'];

	// change x scale to ordinal DOW, with a slight inset for first/last labels to fit more nicely
	parent.x = d3.scale.ordinal()
		.rangePoints([0, parent.width], 0.2);
	
	parent.xAxisTicks = function() {
		return parent.x.domain();
	}
	
	parent.xAxisTickFormatter = function() {
		return function(d, i) {
			if ( parent.xAxisTickCallback() ) {
				return xAxisTickCallback().call(parent.me, d, i, parent.x);
			} else {
				return timeKeyLabels[parent.x.domain().indexOf(d)];
			}
		};
	}
	
	// Boolean, true for northern hemisphere seasons, false for southern.
	var northernHemisphere;

	// object keys define group IDs to treat as "negative" or consumption values, below the X axis
	var negativeGroupMap = { Consumption : true };

	var rawData;
	var groupLayers;

	var linePathGenerator = d3.svg.line()
		.interpolate('monotone')
		.x(function(d) {
			return (Math.round(parent.x(d.date) + 0.5) - 0.5);
		})
		.y(function(d) { 
			return (Math.round(parent.y(d.y) + 0.5) - 0.5);
		});

	function seasonColorFn(d, i) {
		var seasonColors = (parent.config.seasonColors || sn.seasonColors);
		var season = ((i + (northernHemisphere ? 0 : 2)) % 4);
		return seasonColors[season];
	}
	
	function dateForTimeKey(offset) {
		return new Date(Date.UTC(2001, 0, 1) + offset);
	}
	
	function timeKeyForDate(date) {
		date.getTime();
	}
	
	function timeKeyInterval() {
		return d3.time.day.utc;
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
		return { date : dateForTimeKey(array[0].timeKey), 
			y : sum, 
			plus : plus, 
			minus : minus, 
			season : array[0].season, 
			hod : array[0].hod,
			groupId : array[0][parent.internalPropName].groupId };
	}
	
	function setup() {
		var plotPropName = parent.plotPropertyName,
			groupIds = parent.groupIds,
			rangeX = [new Date(), new Date()],
			rangeY = [0, 0],
			interval = timeKeyInterval(),
			keyFormatter = d3.format('02g'); // ensure 10 sorts after 9
		
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
						d.timeKey = timeKeyForDate(d.date);
					}
					
					return d.season;
				})
				.key(function(d) {
					return keyFormatter(d.timeKey);
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
		parent.x.domain(interval.range(rangeX[0], interval.offset(rangeX[1], 1)));
		
		// setup Y domain
		parent.y.domain(rangeY).nice();
		
		parent.computeUnitsY();
	}
	
	function axisXVertRule(d) {
		return (Math.round(parent.x(d) + 0.5) - 0.5);
	}
	
	function drawAxisXRules() {
		var transitionMs = parent.transitionMs();
		var axisLines = parent.svgRuleRoot.selectAll('line.vert').data(parent.x.domain());
		axisLines.transition().duration(transitionMs)
	  		.attr('x1', axisXVertRule)
	  		.attr('x2', axisXVertRule);
		
		axisLines.enter().append('line')
			.style('opacity', 1e-6)
			.classed('vert', true)
			.attr('x1', axisXVertRule)
	  		.attr('x2', axisXVertRule)
	  		.attr('y1', 0)
	  		.attr('y2', parent.height)
		.transition().duration(transitionMs)
			.style('opacity', parent.vertRuleOpacity())
			.each('end', function() {
				// remove the opacity style
				d3.select(this).style('opacity', null);
			});
		
		axisLines.exit().transition().duration(transitionMs)
			.style('opacity', 1e-6)
			.remove();
	}
	
	function setupDrawData() {
		var groupedData = [[],[],[],[]], // one group per season
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
		drawAxisXRules();
	}

	function makeExtend(obj) {
		superMakeExtend(obj);
		Object.defineProperties(obj, {
			dateForTimeKey : { get : function() { return dateForTimeKey; }, set : function(v) { dateForTimeKey = v; } },
			timeKeyForDate : { get : function() { return timeKeyForDate; }, set : function(v) { timeKeyForDate = v; } },
			timeKeyInterval : { get : function() { return timeKeyInterval; }, set : function(v) { timeKeyInterval = v; } }
		});
	}
	
	/**
	 * Toggle between nothern/southern hemisphere seasons, or get the current setting.
	 * 
	 * @param {boolean} [value] <em>true</em> for northern hemisphere seasons, <em>false</em> for sothern hemisphere
	 * @returns when used as a getter, the current setting
	 * @memberOf sn.chart.baseGroupedSeasonalLineChart
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
	 * @memberOf sn.chart.baseGroupedSeasonalLineChart
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

	/**
	 * Get/set the x-axis time-based key names.
	 * 
	 * @param {String[]} [value] the ordinal key names
	 * @return if used as a getter an array with the keys, which are used as labels for the x-axis,
	 *         otherwise this object
	 * @memberOf sn.chart.baseGroupedSeasonalLineChart
	 */
	self.timeKeyLabels = function(value) { 
		if ( !arguments.length ) return timeKeyLabels;
		if ( Array.isArray(value) ) {
			timeKeyLabels = value;
		}
		return parent.me;
	};
	
	makeExtend(self);
	
	// extend
	parent.makeExtend = makeExtend;
	
	// override our setup funciton
	parent.setup = setup;
	
	// define our drawing function
	parent.draw = draw;
	
	return self;
};

}());
