<script lang="ts">
  import '../app.css';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<header class="nav">
  <div class="nav-inner">
    <a class="brand" href="/">
      <span class="brand-mark">s</span><span class="brand-pp">PP</span><span class="brand-rest"
        >eedrun</span
      >
    </a>
    <nav class="nav-links">
      {#if data.user}
        <span class="nav-user">
          {#if data.user.avatar_url}
            <img src={data.user.avatar_url} alt="" class="nav-avatar" />
          {/if}
          <span>{data.user.username}</span>
        </span>
        <form method="POST" action="/logout">
          <button class="btn btn-ghost" type="submit">Log out</button>
        </form>
      {:else}
        <a class="btn" href="/login">Sign in with osu!</a>
      {/if}
    </nav>
  </div>
</header>

<main class="container">
  {@render children()}
</main>

<style>
  .nav {
    border-bottom: 1px solid var(--border);
    background: rgba(18, 10, 23, 0.7);
    backdrop-filter: blur(10px);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .nav-inner {
    max-width: 900px;
    margin: 0 auto;
    padding: 0.85rem 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .brand {
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--text);
  }

  .brand-pp {
    color: var(--pink);
  }

  .brand-rest {
    color: var(--text);
  }

  .brand:hover {
    color: var(--text);
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .nav-user {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text);
    font-weight: 600;
  }

  .nav-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--border);
  }
</style>
