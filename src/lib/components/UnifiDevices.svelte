<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../api';
  import type { UnifiDevice } from '../types';

  let devices: UnifiDevice[] = [];
  let loading = true;
  let error = '';

  async function loadDevices() {
    loading = true;
    error = '';
    try {
      devices = await api.unifi.getDevices();
    } catch (e) {
      error = (e as Error).message ?? String(e);
    } finally {
      loading = false;
    }
  }

  async function powerCycle(device: UnifiDevice) {
    if (!confirm(`Are you sure you want to power cycle ${device.name}?`)) return;
    try {
      await api.unifi.powerCycle(device._id);
      alert(`Power cycle initiated for ${device.name}`);
      loadDevices();
    } catch (e) {
      alert(`Error: ${(e as Error).message ?? e}`);
    }
  }

  async function updateFirmware(device: UnifiDevice) {
    if (!confirm(`Are you sure you want to update firmware for ${device.name}?`)) return;
    try {
      await api.unifi.updateFirmware(device._id);
      alert(`Firmware update initiated for ${device.name}`);
      loadDevices();
    } catch (e) {
      alert(`Error: ${(e as Error).message ?? e}`);
    }
  }

  function formatUptime(seconds: number): string {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  onMount(loadDevices);
</script>

<div class="tab-header">
  <h2>UniFi Network Devices</h2>
  <button class="btn btn-primary" on:click={loadDevices}>Refresh</button>
</div>

{#if loading}
  <div class="loading">Loading devices...</div>
{:else if error}
  <div class="error">Error: {error}</div>
{:else if devices.length === 0}
  <div class="empty">No devices found</div>
{:else}
  <div class="device-grid">
    {#each devices as device (device._id)}
      <div class="device-card">
        <div class="device-header">
          <h3>{device.name || 'Unknown Device'}</h3>
          <span class="status-badge {device.state === 1 ? 'online' : 'offline'}">
            {device.state === 1 ? 'Online' : 'Offline'}
          </span>
        </div>

        <div class="device-info">
          <div class="info-row">
            <span class="label">IP:</span>
            <span class="value">{device.ip || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">MAC:</span>
            <span class="value">{device.mac || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Model:</span>
            <span class="value">{device.model || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Version:</span>
            <span class="value">
              {device.version || 'N/A'}
              {#if device.upgradable && device.upgradeToFirmware}
                <span style="color: #f59e0b;">(Update: {device.upgradeToFirmware})</span>
              {/if}
            </span>
          </div>
          <div class="info-row">
            <span class="label">Uptime:</span>
            <span class="value">{formatUptime(device.uptime)}</span>
          </div>
        </div>

        <div class="device-actions">
          <button class="btn btn-warning" on:click={() => powerCycle(device)}>
            Power Cycle
          </button>
          <button
            class="btn {device.upgradable ? 'btn-info' : 'btn-secondary'}"
            on:click={() => updateFirmware(device)}
            disabled={!device.upgradable}
            title={device.upgradable ? undefined : 'No firmware update available'}
          >
            Update Firmware
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}
