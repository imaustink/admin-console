<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../api';
  import type { K8sNode, NodePortMapping } from '../types';
  import CommandModal from './modals/CommandModal.svelte';
  import AptModal from './modals/AptModal.svelte';

  let nodes: K8sNode[] = [];
  let portMappings: NodePortMapping[] = [];
  let loading = true;
  let error = '';
  let openDropdown: string | null = null;

  // Command modal state
  let showCommandModal = false;
  let commandModalNode = '';

  // APT modal state
  let showAptModal = false;
  let aptModalNode = '';

  async function loadNodes() {
    loading = true;
    error = '';
    try {
      [nodes, portMappings] = await Promise.all([
        api.k8s.getNodes(),
        api.k8s.getNodePortMappings(),
      ]);
    } catch (e) {
      error = (e as Error).message ?? String(e);
    } finally {
      loading = false;
    }
  }

  function getMapping(nodeName: string): NodePortMapping | undefined {
    return portMappings.find((m) => m.nodeName === nodeName);
  }

  function toggleDropdown(nodeName: string) {
    openDropdown = openDropdown === nodeName ? null : nodeName;
  }

  function closeDropdown() {
    openDropdown = null;
  }

  async function drainNode(nodeName: string) {
    closeDropdown();
    if (!confirm(`Drain node ${nodeName}?`)) return;
    try {
      await api.k8s.drainNode(nodeName);
      alert(`Drain initiated for ${nodeName}`);
      loadNodes();
    } catch (e) { alert(`Error: ${(e as Error).message ?? e}`); }
  }

  async function cordonNode(nodeName: string) {
    closeDropdown();
    if (!confirm(`Cordon node ${nodeName}?`)) return;
    try {
      await api.k8s.cordonNode(nodeName);
      alert(`Cordon successful for ${nodeName}`);
      loadNodes();
    } catch (e) { alert(`Error: ${(e as Error).message ?? e}`); }
  }

  async function uncordonNode(nodeName: string) {
    closeDropdown();
    if (!confirm(`Uncordon node ${nodeName}?`)) return;
    try {
      await api.k8s.uncordonNode(nodeName);
      alert(`Uncordon successful for ${nodeName}`);
      loadNodes();
    } catch (e) { alert(`Error: ${(e as Error).message ?? e}`); }
  }

  async function powerCycleNodePort(nodeName: string) {
    closeDropdown();
    if (!confirm(`Power cycle PoE port for ${nodeName}?\n\nThis will cause a hard reboot.`)) return;
    try {
      await api.k8s.powerCycleNodePort(nodeName);
      alert(`Power cycle initiated for ${nodeName}'s PoE port`);
      loadNodes();
    } catch (e) { alert(`Error: ${(e as Error).message ?? e}`); }
  }

  async function rebootNode(node: K8sNode) {
    closeDropdown();
    if (node.schedulable && !confirm(`Reboot ${node.name} via SSH?\n\nNode is still schedulable — consider draining first.`)) return;
    try {
      await api.k8s.rebootNode(node.name);
      alert(`Reboot command sent to ${node.name}`);
      loadNodes();
    } catch (e) { alert(`Error: ${(e as Error).message ?? e}`); }
  }

  async function shutdownNode(node: K8sNode) {
    closeDropdown();
    if (node.schedulable && !confirm(`Shutdown ${node.name} via SSH?\n\nNode is still schedulable — consider draining first.\n\nThis will power off the node completely.`)) return;
    try {
      await api.k8s.shutdownNode(node.name);
      alert(`Shutdown command sent to ${node.name}`);
      loadNodes();
    } catch (e) { alert(`Error: ${(e as Error).message ?? e}`); }
  }

  function openCommandModal(nodeName: string) {
    closeDropdown();
    commandModalNode = nodeName;
    showCommandModal = true;
  }

  function openAptModal(nodeName: string) {
    closeDropdown();
    aptModalNode = nodeName;
    showAptModal = true;
  }

  onMount(loadNodes);
</script>

<!-- Close dropdowns on outside click -->
<svelte:window on:click={closeDropdown} />

<div class="tab-header">
  <h2>Kubernetes Cluster Nodes</h2>
  <button class="btn btn-primary" on:click={loadNodes}>Refresh</button>
</div>

{#if loading}
  <div class="loading">Loading nodes...</div>
{:else if error}
  <div class="error">Error: {error}</div>
{:else if nodes.length === 0}
  <div class="empty">No nodes found</div>
{:else}
  <div class="device-grid">
    {#each nodes as node (node.name)}
      {@const mapping = getMapping(node.name)}
      {@const hasPoe = mapping?.poeAvailable ?? false}
      <div class="node-card" class:dropdown-open={openDropdown === node.name}>
        <div class="node-header">
          <h3>{node.name}</h3>
          <span class="status-badge {node.status.toLowerCase()}">{node.status}</span>
        </div>

        <div class="node-info">
          <div class="info-row">
            <span class="label">IP:</span>
            <span class="value">{node.ip || 'N/A'}</span>
          </div>
          {#if node.mac}
            <div class="info-row">
              <span class="label">MAC:</span>
              <span class="value">{node.mac}</span>
            </div>
          {/if}
          {#if mapping}
            <div class="info-row">
              <span class="label">Switch Port:</span>
              <span class="value">
                {mapping.switchName} Port {mapping.portIdx}
                {#if hasPoe}
                  <span style="color: #10b981;">(PoE)</span>
                {:else}
                  <span style="color: #6b7280;">(Non-PoE)</span>
                {/if}
              </span>
            </div>
          {/if}
          <div class="info-row">
            <span class="label">OS:</span>
            <span class="value">{node.os || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Kernel:</span>
            <span class="value">{node.kernel || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Runtime:</span>
            <span class="value">{node.containerRuntime || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Kubelet:</span>
            <span class="value">{node.kubeletVersion || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Schedulable:</span>
            <span class="value">{node.schedulable ? 'Yes' : 'No'}</span>
          </div>
        </div>

        <div class="node-actions">
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="dropdown" on:click|stopPropagation>
            <button
              class="dropdown-toggle"
              on:click={() => toggleDropdown(node.name)}
            >
              Actions
            </button>
            {#if openDropdown === node.name}
              <div class="dropdown-menu show">
                {#if node.schedulable}
                  <button class="dropdown-item warning" on:click={() => drainNode(node.name)}>
                    Drain Node
                  </button>
                  <button class="dropdown-item" on:click={() => cordonNode(node.name)}>
                    Cordon Node
                  </button>
                {:else}
                  <button class="dropdown-item success" on:click={() => uncordonNode(node.name)}>
                    Uncordon Node
                  </button>
                {/if}
                <button class="dropdown-item info" on:click={() => openCommandModal(node.name)}>
                  Run SSH Command
                </button>
                <button class="dropdown-item info" on:click={() => openAptModal(node.name)}>
                  APT Commands
                </button>
                <button
                  class="dropdown-item danger"
                  on:click={() => powerCycleNodePort(node.name)}
                  disabled={!hasPoe}
                  title={hasPoe ? undefined : 'Not on PoE switch'}
                >
                  Cycle PoE Port
                </button>
                <button class="dropdown-item warning" on:click={() => rebootNode(node)}>
                  Reboot Node
                </button>
                <button class="dropdown-item danger" on:click={() => shutdownNode(node)}>
                  Shutdown Node
                </button>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if showCommandModal}
  <CommandModal
    nodeName={commandModalNode}
    on:close={() => (showCommandModal = false)}
  />
{/if}

{#if showAptModal}
  <AptModal
    nodeName={aptModalNode}
    on:close={() => { showAptModal = false; loadNodes(); }}
  />
{/if}
