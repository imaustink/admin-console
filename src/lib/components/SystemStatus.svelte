<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../api';
  import type { SystemStatus, K8sHealthCheckResult } from '../types';

  let status: SystemStatus | null = null;
  let loading = true;
  let error = '';

  async function loadStatus() {
    loading = true;
    error = '';
    try {
      status = await api.status.getSystemStatus();
    } catch (e) {
      error = (e as Error).message ?? String(e);
    } finally {
      loading = false;
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

  function unhealthyResources(results: K8sHealthCheckResult[]) {
    return results.filter((r) => r.status !== 'healthy');
  }

  function healthyCount(results: K8sHealthCheckResult[]) {
    return results.filter((r) => r.status === 'healthy').length;
  }

  onMount(loadStatus);
</script>

<div class="tab-header">
  <h2>System Status</h2>
  <button class="btn btn-primary" on:click={loadStatus}>Refresh</button>
</div>

{#if loading}
  <div class="loading">Loading status...</div>
{:else if error}
  <div class="error">Error: {error}</div>
{:else if status}
  <div class="status-grid">

    <!-- UniFi Card -->
    <div class="status-card">
      <h3>UniFi Controller</h3>
      <div class="status-indicator {status.unifi.connected ? 'online' : 'offline'}">
        ● {status.unifi.connected ? 'Connected' : 'Disconnected'}
      </div>
      <div class="info-row">
        <span class="label">Devices:</span>
        <span class="value">{status.unifi.deviceCount ?? 0}</span>
      </div>

      {#if status.unifi.internet && status.unifi.internet.uptime !== undefined}
        {@const net = status.unifi.internet}
        <h4>Internet Statistics</h4>
        <div class="info-row">
          <span class="label">Uptime:</span>
          <span class="value">{formatUptime(net.uptime)} ({(net.uptimePercentage ?? 0).toFixed(2)}%)</span>
        </div>
        <div class="info-row">
          <span class="label">Download:</span>
          <span class="value">{(net.downloadSpeed ?? 0).toFixed(2)} Mbps</span>
        </div>
        <div class="info-row">
          <span class="label">Upload:</span>
          <span class="value">{(net.uploadSpeed ?? 0).toFixed(2)} Mbps</span>
        </div>
        <div class="info-row">
          <span class="label">Current DL:</span>
          <span class="value">{((net.downloadBitrate ?? 0) / 1_000_000).toFixed(2)} Mbps</span>
        </div>
        <div class="info-row">
          <span class="label">Current UL:</span>
          <span class="value">{((net.uploadBitrate ?? 0) / 1_000_000).toFixed(2)} Mbps</span>
        </div>
        <div class="info-row">
          <span class="label">Latency:</span>
          <span class="value">{net.latency ?? 0} ms</span>
        </div>
      {/if}
    </div>

    <!-- K8s Card -->
    <div class="status-card">
      <h3>Kubernetes Cluster</h3>
      <div class="status-indicator {status.k8s.connected ? 'online' : 'offline'}">
        ● {status.k8s.connected ? 'Connected' : 'Disconnected'}
      </div>
      <div class="info-row">
        <span class="label">Nodes:</span>
        <span class="value">{status.k8s.nodeCount ?? 0}</span>
      </div>
      <div class="info-row">
        <span class="label">Ready Nodes:</span>
        <span class="value">{status.k8s.readyNodes ?? 0}</span>
      </div>

      {#if status.k8s.resourceHealth && status.k8s.resourceHealth.length > 0}
        {@const unhealthy = unhealthyResources(status.k8s.resourceHealth)}
        {@const healthyNum = healthyCount(status.k8s.resourceHealth)}
        <h4>Resource Health</h4>
        {#each unhealthy as res}
          <div class="info-row">
            <span class="label">{res.kind}/{res.name}:</span>
            <span class="value">
              <span class="status-badge {res.status}">{res.status}</span>
              {#if res.replicas}
                {res.replicas.ready}/{res.replicas.desired}
              {/if}
            </span>
          </div>
        {/each}
        {#if healthyNum > 0}
          <div class="info-row healthy-summary">
            <span class="label">Healthy:</span>
            <span class="value">
              <span class="status-badge healthy">{healthyNum} resource{healthyNum !== 1 ? 's' : ''} healthy</span>
            </span>
          </div>
        {/if}
      {/if}
    </div>

    <!-- Service Health Checks -->
    {#if status.healthChecks && status.healthChecks.length > 0}
      <div class="status-card">
        <h3>Service Health Checks</h3>
        {#each status.healthChecks as check}
          <div class="info-row">
            <span class="label">{check.name}:</span>
            <span class="value">
              <span class="status-badge {check.status}">{check.status}</span>
              {#if check.responseTime}
                {check.responseTime}ms
              {/if}
            </span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Dashboard card -->
    <div class="status-card">
      <h3>Dashboard</h3>
      <div class="info-row">
        <span class="label">Last Updated:</span>
        <span class="value">{new Date().toLocaleString()}</span>
      </div>
    </div>

  </div>
{/if}
