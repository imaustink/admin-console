<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let info: { version: string; body?: string; currentVersion: string };

  const dispatch = createEventDispatcher<{ close: void }>();

  let downloading = false;
  let progress = 0;
  let progressText = '';
  let downloaded = false;

  async function downloadAndInstall() {
    downloading = true;
    progress = 0;

    try {
      // info is an object with a downloadAndInstall method
      await (info as any).downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            progressText = 'Starting download...';
            break;
          case 'Progress':
            progress = event.data.chunkLength / (event.data.contentLength || 1) * 100;
            progressText = `Downloading... ${progress.toFixed(0)}%`;
            break;
          case 'Finished':
            progressText = 'Download complete. Restarting...';
            break;
        }
      });
    } catch (e) {
      alert(`Update failed: ${(e as Error).message ?? e}`);
      downloading = false;
    }
  }

  function close() {
    dispatch('close');
  }
</script>

<div class="modal show">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Update Available</h3>
    </div>

    <div class="modal-body">
      <p>Version <strong>{info.version}</strong> is available.</p>
      {#if info.body}
        <p style="margin-top: 8px; color: #94a3b8; font-size: 0.75rem;">{info.body}</p>
      {/if}

      {#if downloading}
        <div style="margin-top: 12px;">
          <div class="progress-bar">
            <div class="progress-fill" style="width: {progress}%"></div>
          </div>
          <p id="update-progress-text">{progressText}</p>
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" on:click={close} disabled={downloading}>Later</button>
      {#if !downloading}
        <button class="btn btn-primary" on:click={downloadAndInstall}>
          Download &amp; Install
        </button>
      {/if}
    </div>
  </div>
</div>
