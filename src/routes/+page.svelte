<script lang="ts">
  import { onMount } from 'svelte';
  import { liveUpdates } from '$lib/live';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

  // Leaderboard is global: refresh on any new best play.
  onMount(() => liveUpdates(() => true));
</script>

<section class="hero">
  <h1>sPPeedrun</h1>
  <p class="muted">
    Sign in with osu!, and we'll track your best play on every beatmap in real time — racing your
    total pp to the top.
  </p>
</section>

<section>
  <h2>Leaderboard</h2>
  {#if data.leaderboard.length === 0}
    <div class="card empty">No players yet. Be the first to sign in!</div>
  {:else}
    <ol class="board">
      {#each data.leaderboard as row, i (row.id)}
        <li class="card board-row">
          <span class="rank" class:top={i === 0}>#{i + 1}</span>
          <a class="player" href={`/users/${row.id}`}>
            {#if row.avatar_url}
              <img src={row.avatar_url} alt="" class="avatar" />
            {/if}
            <span class="name">{row.username}</span>
          </a>
          <span class="count muted">{row.play_count} plays</span>
          <span class="pp total">{fmt(row.total_pp)}pp</span>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .hero {
    padding: 2.5rem 0 1.5rem;
  }

  .hero h1 {
    font-size: 2.6rem;
    margin: 0 0 0.5rem;
    background: linear-gradient(135deg, var(--pink) 0%, var(--purple) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .hero p {
    max-width: 34rem;
    font-size: 1.05rem;
  }

  .empty {
    padding: 1.5rem;
    text-align: center;
  }

  .board {
    list-style: none;
    margin: 1rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .board-row {
    display: grid;
    grid-template-columns: 3rem 1fr auto auto;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.1rem;
    transition: border-color 0.15s ease;
  }

  .board-row:hover {
    border-color: var(--pink);
  }

  .rank {
    font-weight: 800;
    color: var(--text-muted);
    font-size: 1.05rem;
  }

  .rank.top {
    color: var(--gold);
  }

  .player {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    color: var(--text);
    font-weight: 600;
  }

  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--border);
  }

  .total {
    font-size: 1.05rem;
  }
</style>
