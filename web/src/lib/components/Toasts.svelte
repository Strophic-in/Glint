<script lang="ts">
  import { toasts } from '$lib/toast.svelte';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts.items as t (t.id)}
    <button class="toast {t.kind}" onclick={() => toasts.dismiss(t.id)} aria-label="Dismiss notification">
      <span class="dot"></span>
      <span>{t.text}</span>
    </button>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    z-index: 100;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(440px, calc(100vw - 32px));
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    box-shadow: 0 18px 40px -12px rgba(0, 0, 0, 0.8);
    font-size: 14px;
    cursor: pointer;
    animation: rise 0.2s ease-out;
  }
  .ok .dot {
    color: var(--ok);
  }
  .error .dot {
    color: var(--danger);
  }
  .info .dot {
    color: var(--accent);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
</style>
