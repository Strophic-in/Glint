<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>{page.status} · Glint</title>
</svelte:head>

<section class="container wrap">
  <p class="code">{page.status}</p>
  <h1>{page.status === 404 ? "This page doesn't exist." : 'Something went wrong.'}</h1>
  <p class="muted">{page.status === 404 ? 'The link may be old or mistyped.' : page.error?.message}</p>
  <a class="btn btn-primary" href="/">Back home</a>
</section>

<style>
  .wrap {
    padding-top: 96px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }
  .code {
    font-family: var(--mono);
    color: var(--accent);
    font-weight: 600;
  }
  h1 {
    font-size: clamp(26px, 5vw, 38px);
  }
  .btn {
    margin-top: 10px;
  }
</style>
