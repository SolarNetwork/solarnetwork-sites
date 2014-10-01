/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.5
 * @require solarnetwork-d3-datum 1.0.0
 * @require solarnetwork-d3-util-counter 1.0.0
 */

sn.config.debug = true;
sn.config.host = 'localhost:8680';

function setupToggler() {
	var toggle = $('#toggle-toggle');
	var progress = $('#toggle-progress');
	if ( sn.runtime.toggler === undefined && sn.sec.token() !== undefined ) {
		// NOTE: we show the switch as ON when the PCM is allowing 100% output, 
		//       and OFF when the PCM is limiting the output at 0%; this is
		//       then opposite the control value, where 1 === PCM at 0% and
		//       0 === 100% output
		sn.runtime.toggler = sn.util.controlToggler(sn.runtime.urlHelper)
			.controlID(sn.env.controlId)
			.callback(function(error) {
				if ( error ) {
				
				} else {
					var controlValue = this.integerValue();
					if ( this.pendingInstructionState() === 'Queued' ) {
						progress.show();
						controlValue = this.pendingInstructionIntegerValue();
					} else {
						progress.hide();
					}
					toggle.bootstrapSwitch('setState', (controlValue === 0));
					toggle.bootstrapSwitch('setActive', true);
				}
			});
		sn.runtime.toggler.start();
	}
	toggle.on('switch-change', function(e, data) {
		sn.runtime.toggler.setIntegerValue(data.value ? 0 : 1);
	});
}

function setupUI() {
	d3.selectAll('#details input')
		.on('change', function(e) {
			var me = d3.select(this);
			var propName = me.attr('name');
			var getAvailable = false;
			sn.env[propName] = me.property('value');
			if ( propName === 'nodeId' ) {
				sn.runtime.urlHelper = sn.datum.nodeUrlHelper(sn.env[propName]);
			}
		}).each(function(e) {
			var input = d3.select(this);
			var name = input.attr('name');
			if ( sn.env[name] ) {
				input.property('value', sn.env[name]);
			}
		});
		
	d3.selectAll('.node-id').text(sn.env.nodeId);
	d3.select('#toggle-toggle').attr('data-text-label', sn.env.controlDisplayName);
	d3.select('#toggle-toggle label').text(sn.env.controlDisplayName);

	d3.select('#toggle-toggle').on('click', function() {
		if ( sn.sec.token() === undefined ) {
			// we need to ask for credentials
			$('#credentals-modal').modal('show');	
		}
	});
	$('#credentals-modal').on('hidden.bs.modal', function() {
		var val = d3.select('#cred-token').property('value');
		if ( val.length === 0 ) {
			val = undefined;
		}
		sn.sec.token(val);

		val = d3.select('#cred-secret').property('value');
		if ( val.length === 0 ) {
			val = undefined;
		}
		sn.sec.secret(val);
		
		// clear the secret
		d3.select('#cred-secret').property('value', '');
		
		// for now, we can assume the credential request was from the toggle button, so try the toggle again
		setupToggler();
	}).on('shown.bs.modal', function() {
		$('#cred-token').focus();
	});
}

function onDocumentReady() {
	// FIXME: remove this, for testing only
	sn.sec.token('a09sjds09wu9wjsd9uy2').secret('abc123');

	sn.setDefaultEnv({
		nodeId : 1013,
		controlId : '/power/switch/1',
		controlDisplayName : 'Switch'
	});
	sn.runtime.urlHelper = sn.datum.nodeUrlHelper(sn.env.nodeId, sn.config);
	setupUI();
	setupToggler();
}
