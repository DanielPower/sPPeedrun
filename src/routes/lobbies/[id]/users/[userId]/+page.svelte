<script lang="ts">
  import { onMount } from 'svelte';
  import { liveUpdates } from '$lib/live';
  import PlayList from '$lib/components/PlayList.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Refresh on updates to this user within this lobby (or any lobby change).
  onMount(() =>
    liveUpdates(
      (e) => e.lobbyId === data.lobby.id && (e.type === 'lobby' || e.userId === data.profile.id),
    ),
  );

  const fmtPp = (n: number) => Math.round(n).toLocaleString('en-US');
</script>

<p class="crumb">
  <a href={`/lobbies/${data.lobby.id}`}>← {data.lobby.name}</a>
</p>

<section class="profile-head card">
  {#if data.profile.avatar_url}
    <img src={data.profile.avatar_url} alt="" class="avatar" />
  {/if}
  <div class="who">
    <h1>{data.profile.username}</h1>
    {#if data.profile.country_code}
      <span class="muted">{data.profile.country_code}</span>
    {/if}
  </div>
  <div class="total-box">
    <div class="total-pp">{fmtPp(data.totalPp)}<span class="unit">pp</span></div>
    <div class="muted total-label">total in this lobby</div>
  </div>
</section>

<h2 class="section-title">Best plays</h2>
<PlayList scores={data.scores} emptyMessage="No tracked plays in this lobby yet." />

<style>
  .crumb {
    margin: 1.5rem 0 0;
  }

  .profile-head {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    padding: 1.5rem;
    margin: 0.5rem 0 1.25rem;
  }

  .avatar {
    width: 88px;
    height: 88px;
    border-radius: 16px;
    object-fit: cover;
    border: 1px solid var(--border);
  }

  .who {
    flex: 1;
  }

  .who h1 {
    margin: 0;
    font-size: 1.9rem;
  }

  .total-box {
    text-align: right;
  }

  .total-pp {
    font-size: 2rem;
    font-weight: 800;
    color: var(--pink-bright);
    line-height: 1;
  }

  .total-pp .unit {
    font-size: 1rem;
    margin-left: 0.15rem;
    color: var(--purple);
  }

  .total-label {
    font-size: 0.8rem;
    margin-top: 0.35rem;
  }

  .section-title {
    margin: 0 0 1rem;
  }
</style>
