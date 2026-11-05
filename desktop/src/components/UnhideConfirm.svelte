<script lang="ts">
  // Turning "hide from screen share" off is easy to do by accident and visible to everyone on the
  // call, so it needs a second click.
  let { oncancel, onconfirm }: { oncancel: () => void; onconfirm: () => void } = $props();
</script>

<div class="confirm" role="alertdialog" aria-labelledby="unhide-title">
  <p>
    <b id="unhide-title">Show Glint in screen shares?</b>
    Anyone you share your screen with, and any recording, will see the Glint overlay.
  </p>
  <div class="actions">
    <button class="keep" onclick={oncancel}>Keep hidden</button>
    <button class="show" onclick={onconfirm}>Show it</button>
  </div>
</div>

<style>
  .confirm {
    margin: 4px 0 6px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 143, 147, 0.45);
    border-radius: 10px;
    background: rgba(255, 90, 95, 0.1);
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--muted);
  }
  p {
    margin: 0;
  }
  b {
    display: block;
    margin-bottom: 2px;
    color: var(--text);
    font-weight: 650;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 8px;
  }
  button {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 11px;
    border-radius: 7px;
  }
  .keep {
    color: var(--accent-ink);
    background: var(--accent);
  }
  .show {
    color: #ff8f93;
    background: var(--raise);
  }
  .show:hover {
    background: var(--raise-2);
  }
</style>
