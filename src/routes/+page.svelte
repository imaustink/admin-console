<script lang="ts">
    import type {
        // BaseStat,
        // WLANStat,
        // WANStat,
        // WWWStat,
        // LANStat,
        // VPNStat,
        Device
    } from "../types";
    import { onMount } from "svelte";

    // let wlanStat: WLANStat | null = null;
    // let wanStat: WANStat | null = null;
    // let wwwStat: WWWStat | null = null;
    // let lanStat: LANStat | null = null;
    // let vpnStat: VPNStat | null = null;
    let allDevices: Device[] | null = null;
    onMount(() => {
        // window.ipcRenderer.on('stats', (event, stats: BaseStat[]) => {
        //     wlanStat = stats.find(({ subsystem }) => subsystem === "wlan") as WLANStat;
        //     wanStat = stats.find(({ subsystem }) => subsystem === "wan") as WANStat;
        //     wwwStat = stats.find(({ subsystem }) => subsystem === "www") as WWWStat;
        //     lanStat = stats.find(({ subsystem }) => subsystem === "lan") as LANStat;
        //     vpnStat = stats.find(({ subsystem }) => subsystem === "vpn") as VPNStat;
        // })

        window.ipcRenderer.on("devices", (event, devices: Device[]) => {
            allDevices = devices; //.filter(({ upgradable, upgrade_state }) => upgradable && upgrade_state !== 5);
        })
    });

    async function sendCommand(command: string, ...args: unknown[]) {
        await window.ipcRenderer.invoke(command, ...args);
    }

    function handleUpgrade(mac: string) {
        if (allDevices) {
            allDevices = allDevices.map((device) => {
                if (device.mac === mac) {
                    device.upgrade_started = true;
                }
                return device;
            });
        }
        sendCommand("upgrade", mac).catch(console.error);
    }

    function handleReboot(mac: string) {
        if (allDevices) {
            allDevices = allDevices.map((device) => {
                if (device.mac === mac) {
                    device.reboot_started = true;
                }
                return device;
            });
        }
        sendCommand("reboot", mac).catch(console.error);
    }
</script>
<style>
    * {
        font-family: Courier; 
    }
    h3 {
        margin-top: 0.25rem;
        margin-bottom: 0.25rem;
    }
    .device-list {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: space-around;
        gap: 3px;
    }
    .device {
        padding: 10px;
        border-radius: 4px;
        background: #f5f5f5;
        border: 1px solid #ededed;
        flex-grow: 1;
        width: 30%;
    }
    .device h4 {
        font-size: 1rem;
        margin: 0;
        float: left;
    }
    .device span.status {
        padding: 3px 6px;
        border-radius: 3px;
        text-align: right;
        float: right;
    }

    .clear {
        clear: both;
    }

    .device span.status.up {
        background: #64ed61;
    }

    .device span.status.down {
        background: #ff5257;
    }

    .device p {
        color: #a3a2a2;
        margin-top: 0.25rem;
        margin-bottom: 0.25rem;
        font-size: 0.75rem;
    }
    .device p b {
        color: #1f1f1f;
    }

    button {
        padding: 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer; 
    }

    button.primary {
        padding: 12px;
        background: #2d7cfa;
        color: #ffffff;
        border: none;
        border-radius: 4px;
    }

    button.primary:disabled {
        background: #80b0fe;
        cursor: not-allowed;
    }

    button.danger {
        padding: 12px;
        background: #ff5257;
        color: #1f1f1f;
        border: none;
        border-radius: 4px;
    }

    button.danger:disabled {
        background: #fc888c;
        cursor: not-allowed;
    }
</style>
<!-- <div>
    {#if wlanStat}
        <div>
            <h2>{wlanStat.subsystem}</h2>
            <p><b>status:</b> {wlanStat.status}</p>
            <p><b>up:</b> {wlanStat["tx_bytes-r"]}</p>
            <p><b>down:</b> {wlanStat["rx_bytes-r"]}</p>
        </div>
    {/if}
    {#if wanStat}
        <div>
            <h2>{wanStat.subsystem}</h2>
            <p><b>status:</b> {wanStat.status}</p>
            <p><b>up:</b> {wanStat["tx_bytes-r"]}</p>
            <p><b>down:</b> {wanStat["rx_bytes-r"]}</p>
        </div>
    {/if}
    {#if wwwStat}
        <div>
            <h2>{wwwStat.subsystem}</h2>
            <p><b>status:</b> {wwwStat.status}</p>
            <p><b>up:</b> {wwwStat["tx_bytes-r"]}</p>
            <p><b>down:</b> {wwwStat["rx_bytes-r"]}</p>
        </div>
    {/if}
    {#if lanStat}
        <div>
            <h2>{lanStat.subsystem}</h2>
            <p><b>status:</b> {lanStat.status}</p>
            <p><b>up:</b> {lanStat["tx_bytes-r"]}</p>
            <p><b>down:</b> {lanStat["rx_bytes-r"]}</p>
        </div>
    {/if}
    {#if vpnStat}
        <div>
            <h2>{vpnStat.subsystem}</h2>
            <p><b>status:</b> {vpnStat.status}</p>
            <p><b>up:</b> {vpnStat.remote_user_tx_bytes}</p>
            <p><b>down:</b> {vpnStat.remote_user_rx_bytes}</p>
        </div>
    {/if}
</div> -->
<h3>Network</h3>
<div>
    <div class="device-list">
        {#if allDevices}
            {#each allDevices as device}
                <div class="device">
                    <h4>{device.name}</h4>
                    {#if device.state}<span class="up status">up</span>{:else}<span class="down status">down</span>{/if}
                    <p class="clear">Devices <b>{device.num_sta}</b></p>
                    <p>IP <b>{device.ip}</b></p>
                    <p>MAC <b>{device.mac}</b></p>
                    <!-- {#if device.upgrade_state !== undefined}
                        <p>update state <b>{device.upgrade_state}</b></p>
                    {/if} -->
                    <!-- {#if device.upgrade_to_firmware}
                        <p>next firmware <b>{device.upgrade_to_firmware}</b> </p>
                    {/if} -->
                    {#if device.upgradable || device.upgrade_to_firmware}
                        <button
                            class="primary"
                            disabled={device.upgrade_started || (device.upgrade_state !== undefined && device.upgrade_state > 0)}
                            on:click|once={() => handleUpgrade(device.mac)}
                        >
                            {#if device.upgrade_started || (device.upgrade_state !== undefined && device.upgrade_state > 0)}
                                Updating...
                            {:else}
                                Update
                            {/if}
                        </button>
                    {/if}
                    <button
                        class="primary"
                        disabled={!device.state && !device.reboot_started}
                        on:click|once={() => handleReboot(device.mac)}
                    >
                        {#if device.state}
                            Reboot
                        {:else}
                            offline...
                        {/if}
                    </button>
                </div>
            {/each}
        {/if}
    </div>
</div>
<!-- <ul>
    {#each statuses as status}
        <li>
            <b>{status.subsystem}</b>
            status: {status.status}
            up: {status["tx_bytes-r"] || status.remote_user_rx_bytes}
            down: {status["rx_bytes-r"]}
        </li>
    {/each}    
</ul> -->
