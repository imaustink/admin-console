<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../api';
  import type { NetworkClient } from '../types';

  let clients: NetworkClient[] = [];
  let loading = true;
  let error = '';
  let search = '';
  let filterType: 'all' | 'wired' | 'wireless' = 'all';
  let sortKey: keyof NetworkClient | '' = '';
  let sortAsc = true;

  async function loadClients() {
    loading = true;
    error = '';
    try {
      clients = await api.unifi.getClients();
    } catch (e) {
      error = (e as Error).message ?? String(e);
    } finally {
      loading = false;
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  }

  function formatUptime(seconds: number): string {
    if (!seconds) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function signalClass(signal: number | undefined): string {
    if (signal === undefined) return '';
    if (signal >= -60) return 'signal-good';
    if (signal >= -75) return 'signal-fair';
    return 'signal-poor';
  }

  function toggleSort(key: keyof NetworkClient) {
    if (sortKey === key) {
      sortAsc = !sortAsc;
    } else {
      sortKey = key;
      sortAsc = true;
    }
  }

  function ipToNum(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }

  function compareValues(av: unknown, bv: unknown, key: keyof NetworkClient): number {
    if (key === 'ip') {
      const an = av ? ipToNum(String(av)) : -1;
      const bn = bv ? ipToNum(String(bv)) : -1;
      return an - bn;
    }
    if (av === '' || av == null) return 1;
    if (bv === '' || bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av).localeCompare(String(bv));
  }

  $: filtered = clients
    .filter(c => {
      if (filterType === 'wired' && !c.isWired) return false;
      if (filterType === 'wireless' && c.isWired) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (c.displayName ?? '').toLowerCase().includes(q) ||
          (c.hostname ?? '').toLowerCase().includes(q) ||
          c.mac.toLowerCase().includes(q) ||
          (c.ip ?? '').includes(q) ||
          (c.oui ?? '').toLowerCase().includes(q) ||
          (c.network ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (!sortKey) return 0;
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = compareValues(av, bv, sortKey);
      return sortAsc ? cmp : -cmp;
    });

  $: wiredCount = clients.filter(c => c.isWired).length;
  $: wirelessCount = clients.filter(c => !c.isWired).length;

  async function powerCycleClientPort(client: NetworkClient) {
    const name = client.displayName ?? client.hostname ?? client.mac;
    if (!confirm(`Power cycle PoE port for ${name}?\n\nThis will cause a hard reboot of the device.`)) return;
    try {
      await api.unifi.powerCycleClientPort(client.swMac!, client.swPort!);
      alert(`Power cycle initiated for ${name}'s PoE port`);
    } catch (e) { alert(`Error: ${(e as Error).message ?? e}`); }
  }

  onMount(loadClients);
</script>

<div class="tab-header">
  <h2>Network Clients <span class="client-count">{clients.length}</span></h2>
  <div class="header-controls">
    <input
      class="search-input"
      type="text"
      placeholder="Search…"
      bind:value={search}
    />
    <div class="filter-pills">
      <button
        class="pill {filterType === 'all' ? 'active' : ''}"
        on:click={() => (filterType = 'all')}
      >All {clients.length}</button>
      <button
        class="pill {filterType === 'wired' ? 'active' : ''}"
        on:click={() => (filterType = 'wired')}
      >Wired {wiredCount}</button>
      <button
        class="pill {filterType === 'wireless' ? 'active' : ''}"
        on:click={() => (filterType = 'wireless')}
      >Wireless {wirelessCount}</button>
    </div>
    <button class="btn btn-primary" on:click={loadClients}>Refresh</button>
  </div>
</div>

{#if loading}
  <div class="loading">Loading clients…</div>
{:else if error}
  <div class="error">Error: {error}</div>
{:else if filtered.length === 0}
  <div class="empty">{search || filterType !== 'all' ? 'No clients match the filter' : 'No clients found'}</div>
{:else}
  <div class="table-wrap">
    <table class="clients-table">
      <thead>
        <tr>
          <th class="sortable" on:click={() => toggleSort('displayName')}>
            Name {sortKey === 'displayName' ? (sortAsc ? '↑' : '↓') : ''}
          </th>
          <th class="sortable" on:click={() => toggleSort('ip')}>
            IP {sortKey === 'ip' ? (sortAsc ? '↑' : '↓') : ''}
          </th>
          <th>MAC</th>
          <th>Manufacturer</th>
          <th class="sortable" on:click={() => toggleSort('isWired')}>
            Type {sortKey === 'isWired' ? (sortAsc ? '↑' : '↓') : ''}
          </th>
          <th class="sortable" on:click={() => toggleSort('network')}>
            Network {sortKey === 'network' ? (sortAsc ? '↑' : '↓') : ''}
          </th>
          <th>Connection</th>
          <th class="sortable num" on:click={() => toggleSort('signal')}>
            Signal {sortKey === 'signal' ? (sortAsc ? '↑' : '↓') : ''}
          </th>
          <th class="sortable num" on:click={() => toggleSort('uptime')}>
            Uptime {sortKey === 'uptime' ? (sortAsc ? '↑' : '↓') : ''}
          </th>
          <th class="num">↑ TX</th>
          <th class="num">↓ RX</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each filtered as client (client.mac)}
          <tr class:blocked={client.blocked} class:wireless={!client.isWired}>
            <td class="name-cell">
              <span class="client-name">{client.displayName ?? client.hostname ?? client.mac}</span>
              {#if client.hostname && client.displayName && client.hostname !== client.displayName}
                <span class="hostname">{client.hostname}</span>
              {/if}
            </td>
            <td class="mono">{client.ip ?? '—'}</td>
            <td class="mono muted">{client.mac}</td>
            <td class="muted oui">{client.oui ?? '—'}</td>
            <td>
              <span class="type-badge {client.isWired ? 'wired' : 'wireless'}">
                {client.isWired ? 'Wired' : 'Wi-Fi'}
              </span>
            </td>
            <td class="muted">{client.network ?? '—'}</td>
            <td class="mono muted conn-cell">
              {#if client.isWired}
                {#if client.swMac}
                  Port {client.swPort ?? '?'}
                {:else}
                  —
                {/if}
              {:else}
                {client.essid ?? '—'}
              {/if}
            </td>
            <td class="num">
              {#if !client.isWired && client.signal !== undefined}
                <span class={signalClass(client.signal)}>{client.signal} dBm</span>
              {:else}
                <span class="muted">—</span>
              {/if}
            </td>
            <td class="num muted">{formatUptime(client.uptime)}</td>
            <td class="num muted">{formatBytes(client.txBytes)}</td>
            <td class="num muted">{formatBytes(client.rxBytes)}</td>
            <td>
              {#if client.blocked}
                <span class="status-badge unhealthy">Blocked</span>
              {:else}
                <span class="status-badge healthy">Active</span>
              {/if}
            </td>
            <td class="actions-cell">
              {#if client.poeEnabled && client.swMac && client.swPort}
                <button
                  class="btn-poe-cycle"
                  title="Power cycle PoE port"
                  on:click={() => powerCycleClientPort(client)}
                >⚡ PoE Cycle</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .client-count {
    font-size: 0.6rem;
    color: #444;
    font-weight: 400;
    margin-left: 6px;
    font-variant-numeric: tabular-nums;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .search-input {
    background: #111;
    border: 1px solid #222;
    border-radius: 4px;
    color: #ccc;
    font-size: 0.62rem;
    padding: 3px 8px;
    outline: none;
    width: 140px;
    transition: border-color 0.15s ease;
  }

  .search-input:focus {
    border-color: #444;
    color: #ededed;
  }

  .search-input::placeholder {
    color: #333;
  }

  .filter-pills {
    display: flex;
    gap: 2px;
  }

  .pill {
    background: transparent;
    border: 1px solid #1f1f1f;
    border-radius: 3px;
    color: #444;
    cursor: pointer;
    font-size: 0.58rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    padding: 2px 8px;
    text-transform: uppercase;
    transition: color 0.12s ease, border-color 0.12s ease;
  }

  .pill:hover {
    color: #888;
    border-color: #333;
  }

  .pill.active {
    color: #ededed;
    border-color: #444;
    background: #111;
  }

  .loading, .error, .empty {
    padding: 32px 0;
    text-align: center;
    font-size: 0.65rem;
    color: #444;
  }

  .error {
    color: #ef4444;
  }

  .table-wrap {
    overflow-x: auto;
    border: 1px solid #1a1a1a;
    border-radius: 6px;
  }

  .clients-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.62rem;
  }

  .clients-table thead th {
    background: #0d0d0d;
    border-bottom: 1px solid #1a1a1a;
    color: #444;
    font-size: 0.58rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    padding: 7px 10px;
    text-align: left;
    text-transform: uppercase;
    white-space: nowrap;
    user-select: none;
  }

  .clients-table thead th.num {
    text-align: right;
  }

  .clients-table thead th.sortable {
    cursor: pointer;
  }

  .clients-table thead th.sortable:hover {
    color: #888;
  }

  .clients-table tbody tr {
    border-bottom: 1px solid #141414;
    transition: background 0.1s ease;
  }

  .clients-table tbody tr:last-child {
    border-bottom: none;
  }

  .clients-table tbody tr:hover {
    background: #111;
  }

  .clients-table tbody tr.blocked {
    opacity: 0.5;
  }

  .clients-table td {
    color: #aaa;
    padding: 6px 10px;
    vertical-align: middle;
    white-space: nowrap;
  }

  .clients-table td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .clients-table td.mono {
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 0.6rem;
  }

  .clients-table td.muted {
    color: #555;
  }

  .clients-table td.oui {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .name-cell {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 120px;
  }

  .client-name {
    color: #ccc;
    font-weight: 400;
  }

  .hostname {
    color: #3a3a3a;
    font-size: 0.57rem;
  }

  .type-badge {
    border-radius: 3px;
    font-size: 0.58rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    text-transform: uppercase;
  }

  .type-badge.wired {
    background: rgba(96, 165, 250, 0.08);
    color: #60a5fa;
  }

  .type-badge.wireless {
    background: rgba(167, 139, 250, 0.08);
    color: #a78bfa;
  }

  .conn-cell {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .signal-good  { color: #22c55e; }
  .signal-fair  { color: #f59e0b; }
  .signal-poor  { color: #ef4444; }

  .actions-cell {
    white-space: nowrap;
  }

  .btn-poe-cycle {
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.2);
    border-radius: 3px;
    color: #f59e0b;
    cursor: pointer;
    font-size: 0.58rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    padding: 2px 7px;
    transition: background 0.12s ease, border-color 0.12s ease;
  }

  .btn-poe-cycle:hover {
    background: rgba(245, 158, 11, 0.15);
    border-color: rgba(245, 158, 11, 0.4);
  }
</style>
