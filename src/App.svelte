<script lang="ts">
  import { onMount } from 'svelte';
  import UnifiDevices from './lib/components/UnifiDevices.svelte';
  import K8sNodes from './lib/components/K8sNodes.svelte';
  import SystemStatus from './lib/components/SystemStatus.svelte';
  import UpdateModal from './lib/components/modals/UpdateModal.svelte';
  import { api } from './lib/api';

  let activeTab = 'unifi';

  function setTab(tab: string) {
    activeTab = tab;
  }

  async function handleExit() {
    if (confirm('Are you sure you want to exit?')) {
      await api.app.exit();
    }
  }

  // ─── Update handling ─────────────────────────────────────────────────────────
  let showUpdateModal = false;
  let updateInfo: any = null;

  onMount(async () => {
    // Check for updates — import lazily so it doesn't break non-Tauri builds
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update?.available) {
        updateInfo = update;
        showUpdateModal = true;
      }
    } catch {
      // Updater not available in dev mode
    }
  });
</script>

<div class="container">
  <header>
    <span class="header-label">Homelab Dashboard</span>
    <nav class="tabs">
      <button
        class="tab-button"
        class:active={activeTab === 'unifi'}
        on:click={() => setTab('unifi')}
        on:touchstart|preventDefault={() => setTab('unifi')}
      >
        UniFi
      </button>
      <button
        class="tab-button"
        class:active={activeTab === 'k8s'}
        on:click={() => setTab('k8s')}
        on:touchstart|preventDefault={() => setTab('k8s')}
      >
        Kubernetes
      </button>
      <button
        class="tab-button"
        class:active={activeTab === 'status'}
        on:click={() => setTab('status')}
        on:touchstart|preventDefault={() => setTab('status')}
      >
        Status
      </button>
    </nav>
    <button class="btn btn-danger exit-btn" on:click={handleExit}>Exit</button>
  </header>

  <main>
    {#if activeTab === 'unifi'}
      <UnifiDevices />
    {:else if activeTab === 'k8s'}
      <K8sNodes />
    {:else if activeTab === 'status'}
      <SystemStatus />
    {/if}
  </main>
</div>

{#if showUpdateModal && updateInfo}
  <UpdateModal info={updateInfo} on:close={() => (showUpdateModal = false)} />
{/if}
