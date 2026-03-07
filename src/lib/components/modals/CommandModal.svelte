<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { api } from '../../api';

  export let nodeName: string;

  const dispatch = createEventDispatcher<{ close: void }>();

  let command = '';
  let output = '';
  let showOutput = false;
  let executing = false;

  async function execute() {
    if (!command.trim()) {
      alert('Please enter a command to execute.');
      return;
    }

    executing = true;
    showOutput = true;
    output = 'Running command...\nPlease wait...';

    try {
      output = await api.k8s.runSSHCommand(nodeName, command);
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
      <h3>Run SSH Command</h3>
      <button class="modal-close" on:click={close}>&times;</button>
    </div>

    <div class="modal-body">
      <label for="cmd-node">Node:</label>
      <input id="cmd-node" type="text" value={nodeName} readonly />

      <label for="cmd-input" style="margin-top: 8px;">Command:</label>
      <textarea
        id="cmd-input"
        bind:value={command}
        placeholder="Enter command to run on node..."
        on:keydown={(e) => { if (e.key === 'Enter' && e.ctrlKey) execute(); }}
      ></textarea>

      {#if showOutput}
        <div class="output-display">{output}</div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" on:click={close}>Close</button>
      <button class="btn btn-primary" on:click={execute} disabled={executing}>
        {executing ? 'Executing...' : 'Execute'}
      </button>
    </div>
  </div>
</div>
