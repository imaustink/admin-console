export interface BaseStat {
	status: string;
	subsystem: string;
}

export interface WLANStat extends BaseStat {
	num_user: number;
	num_guest: number;
	num_iot: number;
	'tx_bytes-r': number;
	'rx_bytes-r': number;
	num_ap: number;
	num_adopted: number;
	num_disabled: number;
	num_disconnected: number;
	num_pending: number;
}

export interface WANStat extends BaseStat {
	num_gw: number;
	num_adopted: number;
	num_disconnected: number;
	num_pending: number;
	wan_ip: string;
	gateways: [];
	netmask: string;
	nameservers: [];
	num_sta: number;
	'tx_bytes-r': number;
	'rx_bytes-r': number;
	gw_mac: string;
	gw_name: string;
	'gw_system-stats': { cpu: string; mem: string; uptime: string }[];
	gw_version: string;
	isp_name: string;
	isp_organization: string;
	uptime_stats: {
		availability?: number;
		latency_average?: number;
		time_period?: number;
		uptime?: number;
		downtime?: number;
		monitors: {
			availability: number;
			latency_average?: number;
			target: string;
		}[];
	}[];
}

export interface WWWStat extends BaseStat {
	drops: number;
	gw_mac: string;
	latency: number;
	'rx_bytes-r': number;
	speedtest_lastrun: number;
	speedtest_ping: number;
	speedtest_status: string;
	status: string;
	subsystem: string;
	'tx_bytes-r': number;
	uptime: number;
	xput_down: number;
	xput_up: number;
}

export interface LANStat extends BaseStat {
	lan_ip: string;
	num_adopted: number;
	num_disconnected: number;
	num_guest: number;
	num_iot: number;
	num_pending: number;
	num_sw: number;
	num_user: number;
	'rx_bytes-r': number;
	status: string;
	subsystem: string;
	'tx_bytes-r': number;
}

export interface VPNStat extends BaseStat {
	remote_user_enabled?: boolean;
	remote_user_num_active?: number;
	remote_user_num_inactive?: number;
	remote_user_rx_bytes?: number;
	remote_user_rx_packets?: number;
	remote_user_tx_bytes?: number;
	remote_user_tx_packets?: number;
	site_to_site_enabled?: boolean;
	status: string;
	subsystem: string;
}

export interface Device {
	_id: string;
	ip: string;
	mac: string;
	model: string;
	model_in_lts: boolean;
	model_in_eol: boolean;
	type: string;
	version: string;
	adopted: boolean;
	site_id: string;
	x_authkey: string;
	cfgversion: string;
	syslog_key: string;
	config_network: Record<string, unknown>;
	setup_id: string;
	jumboframe_enabled: boolean;
	flowctrl_enabled: boolean;
	stp_version: string;
	stp_priority: string;
	dot1x_portctrl_enabled: boolean;
	power_source_ctrl_enabled: boolean;
	license_state: string;
	unsupported: boolean;
	unsupported_reason: number;
	name: string;
	x_fingerprint: string;
	x_ssh_hostkey_fingerprint: string;
	inform_url: string;
	inform_ip: string;
	required_version: string;
	kernel_version: string;
	architecture: string;
	hash_id: string;
	gateway_mac: string;
	board_rev: number;
	manufacturer_id: number;
	internet: boolean;
	model_incompatible: boolean;
	x_aes_gcm: boolean;
	connected_at: number;
	ethernet_table: [];
	port_table: [];
	switch_caps: Record<string, unknown>;
	has_fan: boolean;
	has_temperature: boolean;
	hw_caps: number;
	fw_caps: number;
	satisfaction: number;
	anomalies: number;
	sys_error_caps: number;
	provisioned_at: number;
	last_uplink: Record<string, unknown>;
	serial: string;
	lcm_tracker_enabled: boolean;
	lcm_tracker_seed: string;
	two_phase_adopt: boolean;
	anon_id: string;
	lcm_brightness: number;
	lcm_night_mode_begins: string;
	lcm_night_mode_ends: string;
	lcm_night_mode_enabled: boolean;
	adoption_completed: boolean;
	device_id: string;
	uplink: Record<string, unknown>;
	state: number;
	start_disconnected_millis: number;
	last_seen: number;
	next_interval: number;
	known_cfgversion: string;
	start_connected_millis: number;
	min_inform_interval_seconds: number;
	upgradable: boolean;
	adoptable_when_upgraded: boolean;
	rollupgrade: boolean;
	prev_non_busy_state: number;
	uptime: number;
	_uptime: number;
	locating: boolean;
	connect_request_ip: string;
	connect_request_port: string;
	sys_stats: Record<string, unknown>;
	'system-stats': Record<string, unknown>;
	ssh_session_table: [];
	lldp_table: [];
	displayable_version: string;
	connection_network_name: string;
	startup_timestamp: number;
	is_access_point: boolean;
	overheating: boolean;
	total_max_power: number;
	downlink_table: [];
	dhcp_server_table: [];
	stat: Record<string, unknown>;
	tx_bytes: number;
	rx_bytes: number;
	bytes: number;
	num_sta: number;
	'user-num_sta': number;
	'guest-num_sta': number;
	x_has_ssh_hostkey: boolean;
	upgrade_to_firmware: string;
	upgrade_state?: number;
	// TODO I added this as a lazy way to manage state. I should figure out a better way
	upgrade_started?: boolean;
	reboot_started?: boolean;
}
