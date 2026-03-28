<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { api } from '../../api';

  export let nodeName: string;

  const dispatch = createEventDispatcher<{ close: void }>();

  const aptCommands = [
    { value: 'update', label: 'Update (apt-get update)' },
    { value: 'upgrade', label: 'Upgrade (apt-get upgrade -y)' },
    { value: 'dist-upgrade', label: 'Dist-Upgrade (apt-get dist-upgrade -y)' },
    { value: 'autoremove', label: 'Autoremove (apt-get autoremove -y)' },
    { value: 'autoclean', label: 'Autoclean (apt-get autoclean)' },
    { value: 'clean', label: 'Clean (apt-get clean)' },
  ];

  let selectedCommand = 'update';
  let output = '';
  let showOutput = false;
  let executing = false;

  async function executeApt() {
    const confirmMsg =
      selectedCommand === 'upgrade' || selectedCommand === 'dist-upgrade'
        ? `Run "apt-get ${selectedCommand}" on ${nodeName}?\n\nThis may take several minutes and could restart services.`
        : `Run "apt-get ${selectedCommand}" on ${nodeName}?`;

    if (!confirm(confirmMsg)) return;

    executing = true;
    showOutput = true;
    output = `Running apt ${selectedCommand}...\nPlease wait, this may take a while...`;

    try {
      output = await api.k8s.runAptCommand(nodeName, selectedCommand);
    } catch (e) {
      output = `Error: ${(e as Error).message ?? e}`;
    } finally {
      executing = false;
    }
  }

  function close() {
    dispatch('close');
  }
</script>

<div class="modal show">
  <div class="modal-content">
    <div class="modal-header">
      <h3>APT Commands</h3>
      <button class="modal-close" on:click={close}>&times;</button>
    </div>

    <div class="modal-body">
      <label for="apt-node">Node:</label>
      <input id="apt-node" type="text" value={nodeName} readonly />

      <label for="apt-select" style="margin-top: 8px;">Select Command:</label>
      <select id="apt-select" bind:value={selectedCommand}>
        {#each aptCommands as { value, label }}
          <option {value}>{label}</option>
        {/each}
      </select>

      {#if showOutput}
        <div class="output-display">{output}</div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" on:click={close}>Close</button>
      <button class="btn btn-primary" on:click={executeApt} disabled={executing}>
        {executing ? 'Executing...' : 'Execute'}
      </button>
    </div>
  </div>
</div>
