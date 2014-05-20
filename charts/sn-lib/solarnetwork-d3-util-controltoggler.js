/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3-sec 1.0
 */

if ( sn === undefined ) {
	sn = {};
}
if ( sn.util === undefined ) {
	sn.util = {};
}

sn.util.controlToggler = function(configuration) {
	var that = {
		version : "1.0.0"
	};
	var config = {
		controlID					: '/power/switch/1',
		nodeUrlHelper				: sn.runtime.urlHelper,
		refreshMs					: 60000,
		callback					: undefined,
	};

	var timer = undefined;
	var lastKnownStatus = undefined;
	var lastKnownInstruction = undefined;
	
	function notifyDelegate() {
		if ( config.callback !== undefined ) {
			try {
				config.callback.call(that);
			} catch ( error ) {
				sn.log('Error in callback: {0}', error);
			}
		}
	}
	
	function getActiveInstruction(data) {
		if ( !Array.isArray(data) || data.length === 0 ) {
			return undefined;
		}
		var instruction = data.reduce(function(prev, curr) {
			if ( curr.topic === 'SetControlParameter' && Array.isArray(curr.parameters)
				&& curr.parameters.length > 0 && curr.parameters[0].name === config.controlID
				&& (prev === undefined || prev.created < curr.created) ) {
				return curr;
			}
			return prev;
		}, undefined);
		if ( instruction !== undefined ) {
			sn.log('Active instruction found in state [{0}]; set control {1} to {2}', 
				instruction.state, config.controlID, instruction.parameters[0].value);
		}
		return instruction;
	}
	
	function configure(configuration) {
		var prop = undefined;
		for ( prop in configuration ) {
			config[prop] = configuration[prop];
		}
	}
	that.configure = configure;
	
	that.integerValue = function() {
		return (lastKnownStatus === undefined ? undefined : lastKnownStatus.integerValue);
	};
	
	that.pendingInstructionState = function() {
		return (lastKnownInstruction === undefined ? undefined : lastKnownInstruction.state);
	};
	
	that.pendingInstructionIntegerValue = function() {
		return (lastKnownInstruction === undefined ? undefined : Number(lastKnownInstruction.parameters[0].value));
	};
	
	that.setIntegerValue = function(v) {
    	var q = queue();
    	var currentValue = that.integerValue();
    	var pendingState = that.pendingInstructionState();
    	var pendingValue = that.pendingInstructionIntegerValue();
		if ( pendingState === 'Queued' && pendingValue !== v ) {
			// cancel the pending instruction
			sn.log('Canceling pending control {0} switch to {1}', config.controlID,  pendingValue);
			q.defer(sn.sec.json, config.nodeUrlHelper.updateInstructionState(lastKnownInstruction.id, 'Declined'), 'POST');
			lastKnownInstruction = undefined;
			pendingState = undefined;
			pendingValue = undefined;
		}
		if ( currentValue !== v && pendingValue !== v ) {
			sn.log('Request to change control {0} to {1}', config.controlID, v);
			q.defer(sn.sec.json, config.nodeUrlHelper.queueInstruction('SetControlParameter', 
				[{name:config.controlID, value:String(v)}]), 'POST');
		}
		q.awaitAll(function(error, results) {
			if ( error ) {
				sn.log('Error updating control toggler {0}: {1}', config.controlID, error);
				return;
			}
			if ( results.length < 1 ) {
				// we queued nothing
				return;
			}
			var cancelResult = results[0];
			// note == null check here, which handles either undefined or null
			if ( cancelResult.data == null && cancelResult.success === true ) {
				// it was cancelled
				lastKnownInstruction = undefined;
			}
			var instructionResult = results[results.length - 1].data;
			if ( !(instructionResult == null) ) {
				// this is the last know instruction now
				lastKnownInstruction = instructionResult;
			}
			
			// invoke the client callback so they know the instruction state has changed
			notifyDelegate();
		});
	};
	
	function update() {
    	var q = queue();
		q.defer(sn.sec.json, config.nodeUrlHelper.mostRecentQuery('HardwareControl'), 'GET');
		q.defer(sn.sec.json, config.nodeUrlHelper.viewActiveInstructions(), 'GET');
		q.await(function(error, status, active) {
			if ( error ) {
				sn.log('Error querying control toggler {0} status: {1}', config.controlID, error);
			} else {
				// get current status of control
				var i, len;
				var controlStatus = undefined;
				if ( status.data != null ) {
					for ( i = 0, len = status.data.length; i < len && controlStatus === undefined; i++ ) {
						if ( status.data[i].sourceId === config.controlID ) {
							controlStatus = status.data[i];
						}
					}
				}
				
				// get current instruction (if any)
				var pendingInstruction = (active == null ? undefined : getActiveInstruction(active.data));
				var pendingInstructionValue = (pendingInstruction === undefined ? undefined : Number(pendingInstruction.parameters[0].value));
				var lastKnownInstructionValue = that.pendingInstructionIntegerValue();
				if ( controlStatus !== undefined && (lastKnownStatus === undefined 
						|| controlStatus.integerValue !== lastKnownStatus.integerValue)
						|| pendingInstructionValue !== lastKnownInstructionValue  ) {
					sn.log('Control {0} value is currently {1}', config.controlID, controlStatus.integerValue);
					lastKnownStatus = controlStatus;
					lastKnownInstruction = pendingInstruction;
					
					// invoke the client callback so they know the data has been updated
					notifyDelegate();
				}
			
				// if timer was defined, keep going as if interval set
				if ( timer !== undefined ) {
					timer = setTimeout(update, config.refreshMs);
				}
			}
		});

		return that;
	}
	
	function start() {
		if ( timer !== undefined ) {
			return;
		}
		timer = setTimeout(update, 20);
		return that;
	}
	that.start = start;
	
	function stop() {
		if ( timer === undefined ) {
			return;
		}
		clearTimeout(timer);
		timer = undefined;
		return that;
	}
	that.stop = stop;

	configure(configuration);
	return that;
};
