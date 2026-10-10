<script lang="ts">
import { useMutation, useQuery } from 'convex-svelte';
import { useClerkContext } from 'svelte-clerk/client';
import { uploadImageToConvex } from '#lib';
import { page } from '$app/state';
import { api } from '$convex/_generated/api';
import type { Id } from '$convex/_generated/dataModel';

const clerk = useClerkContext();
const sessionId = $derived(page.params.id as Id<'sessions'>);

// Queries
const session = useQuery(api.sessions.get, () => ({ sessionId }));
const items = useQuery(api.items.list, () => ({ sessionId }));
const rankings = useQuery(api.rankings.listBySession, () => ({ sessionId }));
const consensus = useQuery(api.rankings.getConsensus, () => ({ sessionId }));

// Mutations
const generateUploadUrl = useMutation(api.sessions.generateUploadUrl);
const createItem = useMutation(api.items.create);
const removeItem = useMutation(api.items.remove);
const joinSession = useMutation(api.rankings.joinSession);
const savePlacement = useMutation(api.rankings.savePlacement);
const setReady = useMutation(api.rankings.setReady);
const updateSessionStatus = useMutation(api.sessions.updateStatus);

// Client-side identity for testing or guest access
let localUserId = $state('');
let localUserName = $state('');

$effect(() => {
  if (typeof window !== 'undefined') {
    let id = localStorage.getItem('tears_client_id');
    if (!id) {
      id = `user_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('tears_client_id', id);
    }
    localUserId = id;

    let storedName = localStorage.getItem('tears_user_name');
    if (clerk.user?.fullName) {
      localUserName = clerk.user.fullName;
    } else if (storedName) {
      localUserName = storedName;
    } else {
      localUserName = `Taster ${id.slice(-3).toUpperCase()}`;
      localStorage.setItem('tears_user_name', localUserName);
    }
  }
});

// Auto-join session
$effect(() => {
  if (sessionId && localUserId && localUserName) {
    joinSession({
      sessionId,
      clientUserId: localUserId,
      userName: localUserName,
      userAvatar: clerk.user?.imageUrl,
    }).catch((err) => console.error('Join error:', err));
  }
});

// Current user's ranking
const myRanking = $derived.by(() => {
  const list = rankings.data ?? [];
  const clerkId = clerk.user?.id;
  return list.find((r) => (clerkId && r.userId === clerkId) || r.userId === localUserId);
});

// Placement map for quick lookup: itemId -> { tierId, rank }
const myPlacementMap = $derived.by(() => {
  const map = new Map<string, { tierId: string; rank: number }>();
  if (myRanking?.placements) {
    for (const p of myRanking.placements) {
      map.set(p.itemId, p);
    }
  }
  return map;
});

// Unranked items pool derived reactively
const unrankedItems = $derived.by(() => {
  const list = items.data ?? [];
  return list.filter((item) => !myPlacementMap.has(item._id));
});

// Active tab in revealed mode ('consensus' | 'compare' | 'my')
let activeTab = $state<'consensus' | 'compare' | 'my'>('consensus');
let compareUserIndex = $state(0);

// Add Item Modal state
let isAddModalOpen = $state(false);
let isUploading = $state(false);
let uploadError = $state('');
let newItemName = $state('');
let newItemNotes = $state('');
let selectedFile = $state<File | null>(null);
let previewUrl = $state<string | null>(null);
let fileInputRef = $state<HTMLInputElement | null>(null);

// Name edit modal state
let isNameModalOpen = $state(false);
let tempUserName = $state('');

// Copy feedback
let copyFeedback = $state('');

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
}

async function handleAddItem(e: SubmitEvent) {
  e.preventDefault();
  if (!selectedFile || isUploading) return;

  isUploading = true;
  uploadError = '';
  try {
    // 1. Upload photo to Convex storage
    const storageId = await uploadImageToConvex(selectedFile, async () => {
      return await generateUploadUrl({});
    });

    // 2. Insert item into database
    await createItem({
      sessionId,
      name: newItemName.trim() || `Item #${(items.data?.length ?? 0) + 1}`,
      imageStorageId: storageId as Id<'_storage'>,
      notes: newItemNotes.trim() || undefined,
      addedByName: localUserName,
    });

    // Reset modal
    selectedFile = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    newItemName = '';
    newItemNotes = '';
    isAddModalOpen = false;
  } catch (err: unknown) {
    uploadError = err instanceof Error ? err.message : 'Failed to upload photo';
  } finally {
    isUploading = false;
  }
}

async function handleMoveItem(itemId: Id<'items'>, tierId: string | null) {
  try {
    await savePlacement({
      sessionId,
      clientUserId: localUserId,
      itemId,
      tierId,
    });
  } catch (err) {
    console.error('Failed to move item:', err);
  }
}

async function handleToggleReady() {
  if (!myRanking) return;
  try {
    await setReady({
      sessionId,
      clientUserId: localUserId,
      isReady: !myRanking.isReady,
    });
  } catch (err) {
    console.error('Failed to update ready status:', err);
  }
}

async function handleToggleStatus() {
  if (!session.data) return;
  const nextStatus = session.data.status === 'ranking' ? 'revealed' : 'ranking';
  try {
    await updateSessionStatus({
      sessionId,
      status: nextStatus,
    });
  } catch (err) {
    console.error('Failed to update status:', err);
  }
}

function copyRoomLink() {
  if (typeof window !== 'undefined') {
    navigator.clipboard.writeText(window.location.href);
    copyFeedback = 'Link copied!';
    setTimeout(() => (copyFeedback = ''), 2000);
  }
}

function saveNewName() {
  const trimmed = tempUserName.trim();
  if (!trimmed) return;
  localUserName = trimmed;
  if (typeof window !== 'undefined') {
    localStorage.setItem('tears_user_name', trimmed);
  }
  joinSession({
    sessionId,
    clientUserId: localUserId,
    userName: trimmed,
  });
  isNameModalOpen = false;
}

// Drag & Drop helpers
let draggedItemId = $state<string | null>(null);

function onDragStart(e: DragEvent, itemId: string) {
  draggedItemId = itemId;
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', itemId);
    e.dataTransfer.effectAllowed = 'move';
  }
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
}

function onDropTier(e: DragEvent, tierId: string | null) {
  e.preventDefault();
  const itemId = draggedItemId || e.dataTransfer?.getData('text/plain');
  if (itemId) {
    handleMoveItem(itemId as Id<'items'>, tierId);
  }
  draggedItemId = null;
}
</script>

{#if session.isLoading}
	<div class="py-24 text-center space-y-4">
		<div class="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
		<p class="text-sm text-muted-foreground">Loading tasting room...</p>
	</div>
{:else if !session.data}
	<div class="max-w-md mx-auto py-20 text-center space-y-4">
		<div class="p-8 rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive space-y-3">
			<h2 class="font-bold text-xl">Session Not Found</h2>
			<p class="text-sm">This tasting room does not exist or may have been deleted.</p>
			<a href="/" class="inline-block px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
				Return to Home
			</a>
		</div>
	</div>
{:else}
	{@const s = session.data}
	{@const itemList = items.data ?? []}
	{@const rankingList = rankings.data ?? []}
	{@const consensusData = consensus.data}

	<!-- Room Header & Control Bar -->
	<div class="space-y-6">
		<div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/60">
			<div class="space-y-1">
				<div class="flex items-center gap-2.5">
					<h1 class="text-2xl sm:text-3xl font-black tracking-tight">{s.title}</h1>
					<span
						class="text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider {s.status === 'revealed'
							? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25'
							: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'}"
					>
						{s.status === 'revealed' ? '🎉 Revealed' : '👅 Live Tasting'}
					</span>
				</div>
				<div class="flex items-center gap-3 text-xs text-muted-foreground">
					<span>Room Code: <strong class="font-mono text-foreground">{s.code}</strong></span>
					<span>•</span>
					<button
						onclick={copyRoomLink}
						class="hover:text-foreground font-medium underline underline-offset-2 transition-colors cursor-pointer"
					>
						{copyFeedback || 'Share Link'}
					</button>
					<span>•</span>
					<button
						onclick={() => {
							tempUserName = localUserName;
							isNameModalOpen = true;
						}}
						class="hover:text-foreground font-medium underline underline-offset-2 transition-colors cursor-pointer"
					>
						Tasting as: <strong class="text-foreground">{localUserName}</strong> ✏️
					</button>
				</div>
			</div>

			<!-- Quick Actions -->
			<div class="flex items-center gap-2.5 flex-wrap">
				<button
					onclick={() => (isAddModalOpen = true)}
					class="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-sm shadow-sm shadow-rose-500/15 transition-all flex items-center gap-1.5 cursor-pointer"
				>
					<span>📸</span>
					<span>Add Item</span>
				</button>

				{#if s.status === 'ranking'}
					<button
						onclick={handleToggleReady}
						class="px-4 py-2 rounded-xl border text-sm font-semibold transition-all cursor-pointer {myRanking?.isReady
							? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
							: 'bg-secondary hover:bg-secondary/80 text-secondary-foreground border-border'}"
					>
						{myRanking?.isReady ? '✓ Ready (Click to edit)' : 'Mark as Ready'}
					</button>
				{/if}

				<button
					onclick={handleToggleStatus}
					class="px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer {s.status === 'ranking'
						? 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm shadow-purple-600/20'
						: 'bg-muted hover:bg-muted/80 text-foreground border border-border'}"
				>
					{s.status === 'ranking' ? '🎉 Reveal Consensus' : '← Back to Ranking'}
				</button>
			</div>
		</div>

		<!-- Participants Live Bar -->
		<div class="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
			<span class="text-muted-foreground font-medium shrink-0">Tasters:</span>
			{#each rankingList as r (r._id)}
				<div
					class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold shrink-0 {r.isReady
						? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
						: 'bg-muted/60 text-muted-foreground border-border/50'}"
				>
					<span class="w-1.5 h-1.5 rounded-full {r.isReady ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}"></span>
					<span>{r.userName}</span>
					{#if r.isReady}
						<span>✓</span>
					{/if}
				</div>
			{/each}
		</div>

		<!-- ============================================== -->
		<!-- MODE 1: RANKING VIEW (Private Drag & Drop / Tap) -->
		<!-- ============================================== -->
		{#if s.status === 'ranking'}
			<div class="space-y-6">
				<!-- Tier Rows -->
				<div class="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm divide-y divide-border/60">
					{#each s.tiers as tier (tier.id)}
						{@const placedHere = itemList.filter((item) => myPlacementMap.get(item._id)?.tierId === tier.id)}
						<div
							class="flex flex-col sm:flex-row items-stretch min-h-[90px] transition-colors"
							ondragover={onDragOver}
							ondrop={(e) => onDropTier(e, tier.id)}
							role="region"
							aria-label={`Tier ${tier.name}`}
						>
							<!-- Tier Label Badge -->
							<div
								class="w-full sm:w-28 shrink-0 flex items-center justify-center p-3 sm:p-4 font-black text-2xl sm:text-3xl text-white select-none shadow-inner"
								style="background-color: {tier.color};"
							>
								{tier.name}
							</div>

							<!-- Tier Item Dropzone -->
							<div class="flex-1 p-3 flex flex-wrap items-center gap-3 bg-muted/10 min-h-[70px]">
								{#if placedHere.length === 0}
									<span class="text-xs text-muted-foreground/50 italic px-2">
										Drag or tap items into {tier.name} tier
									</span>
								{:else}
									{#each placedHere as item (item._id)}
										<!-- Placed Item Card -->
										<div
											role="listitem"
											draggable="true"
											ondragstart={(e) => onDragStart(e, item._id)}
											class="group relative w-24 sm:w-28 rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-grab active:cursor-grabbing"
										>
											{#if item.imageUrl}
												<img
													src={item.imageUrl}
													alt={item.name}
													class="w-full h-20 sm:h-24 object-cover bg-muted"
												/>
											{:else}
												<div class="w-full h-20 sm:h-24 bg-muted flex items-center justify-center text-xs text-muted-foreground">
													No Photo
												</div>
											{/if}
											<div class="p-1.5 bg-card/95">
												<p class="text-[11px] font-bold line-clamp-1 leading-tight text-foreground">{item.name}</p>
											</div>

											<!-- Mobile Quick Re-Tier Bar -->
											<div class="flex items-center justify-center gap-0.5 p-1 bg-muted/40 border-t border-border/40">
												{#each s.tiers as t (t.id)}
													<button
														onclick={() => handleMoveItem(item._id, t.id)}
														class="w-4 h-4 rounded text-[9px] font-bold text-white flex items-center justify-center hover:scale-110 transition-transform cursor-pointer"
														style="background-color: {t.color}; opacity: {t.id === tier.id ? '1' : '0.45'};"
														title="Move to {t.name}"
													>
														{t.name}
													</button>
												{/each}
												<button
													onclick={() => handleMoveItem(item._id, null)}
													class="w-4 h-4 rounded text-[9px] font-bold bg-muted-foreground/30 hover:bg-destructive hover:text-white text-foreground flex items-center justify-center transition-colors cursor-pointer"
													title="Unrank"
												>
													✕
												</button>
											</div>
										</div>
									{/each}
								{/if}
							</div>
						</div>
					{/each}
				</div>

				<!-- Unranked Items Pool -->
				<div
					class="rounded-2xl border border-border/80 bg-card p-5 space-y-3"
					ondragover={onDragOver}
					ondrop={(e) => onDropTier(e, null)}
					role="region"
					aria-label="Unranked items pool"
				>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<h3 class="font-bold text-base text-foreground">Unranked Tasting Items</h3>
							<span class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
								{unrankedItems.length}
							</span>
						</div>
						<p class="text-xs text-muted-foreground hidden sm:block">
							Tap tier buttons or drag onto the board above
						</p>
					</div>

					{#if unrankedItems.length === 0}
						<div class="p-8 border border-dashed border-border/70 rounded-xl text-center space-y-2">
							<p class="text-sm font-semibold text-foreground">All items ranked! 🎉</p>
							<p class="text-xs text-muted-foreground">
								Click "Mark as Ready" when you're satisfied with your tiers.
							</p>
						</div>
					{:else}
						<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
							{#each unrankedItems as item (item._id)}
								<div
									role="listitem"
									draggable="true"
									ondragstart={(e) => onDragStart(e, item._id)}
									class="group relative rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing flex flex-col justify-between"
								>
									<div>
										{#if item.imageUrl}
											<img
												src={item.imageUrl}
												alt={item.name}
												class="w-full h-28 object-cover bg-muted"
											/>
										{:else}
											<div class="w-full h-28 bg-muted flex items-center justify-center text-xs text-muted-foreground">
												No Photo
											</div>
										{/if}
										<div class="p-2">
											<p class="text-xs font-bold line-clamp-1 text-foreground">{item.name}</p>
											{#if item.notes}
												<p class="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{item.notes}</p>
											{/if}
										</div>
									</div>

									<!-- Mobile Quick Tier Tap Buttons (A3 requirement) -->
									<div class="p-1.5 bg-muted/30 border-t border-border/40 flex items-center justify-between gap-1">
										{#each s.tiers as t (t.id)}
											<button
												onclick={() => handleMoveItem(item._id, t.id)}
												class="flex-1 h-6 rounded text-[10px] font-black text-white flex items-center justify-center hover:opacity-90 active:scale-95 transition-all shadow-xs cursor-pointer"
												style="background-color: {t.color};"
											>
												{t.name}
											</button>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- ============================================== -->
		<!-- MODE 2: REVEALED CONSENSUS VIEW & DEBATES      -->
		<!-- ============================================== -->
		{#if s.status === 'revealed'}
			<div class="space-y-6">
				<!-- Tab Navigation -->
				<div class="flex items-center gap-2 border-b border-border/60 pb-2">
					<button
						onclick={() => (activeTab = 'consensus')}
						class="px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer {activeTab === 'consensus'
							? 'bg-purple-600 text-white shadow-sm'
							: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
					>
						✨ Consensus Tier List
					</button>
					<button
						onclick={() => (activeTab = 'compare')}
						class="px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer {activeTab === 'compare'
							? 'bg-purple-600 text-white shadow-sm'
							: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
					>
						👥 Compare Tasters
					</button>
					<button
						onclick={() => (activeTab = 'my')}
						class="px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer {activeTab === 'my'
							? 'bg-purple-600 text-white shadow-sm'
							: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
					>
						👤 My Board
					</button>
				</div>

				<!-- Highlights (Spiciest Debate & Mind Meld) -->
				{#if consensusData && (consensusData.spiciest || consensusData.mindMeld)}
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<!-- Spiciest Debate -->
						{#if consensusData.spiciest}
							{@const spicy = consensusData.spiciest}
							<div class="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 sm:p-5 flex items-center gap-4 relative overflow-hidden">
								<div class="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-muted border border-rose-500/20">
									{#if spicy.imageUrl}
										<img src={spicy.imageUrl} alt={spicy.name} class="w-full h-full object-cover" />
									{/if}
								</div>
								<div class="space-y-1 min-w-0">
									<div class="flex items-center gap-2">
										<span class="text-xs font-black px-2 py-0.5 rounded-full bg-rose-500 text-white uppercase tracking-wider">
											🌶️ Spiciest Debate
										</span>
									</div>
									<h4 class="font-bold text-base text-foreground truncate">{spicy.name}</h4>
									<div class="flex flex-wrap gap-2 text-xs text-muted-foreground pt-0.5">
										{#each spicy.scores as score}
											<span class="font-medium text-foreground">
												{score.userName}: <strong class="text-rose-500">{score.tierId}</strong>
											</span>
										{/each}
									</div>
								</div>
							</div>
						{/if}

						<!-- Mind Meld -->
						{#if consensusData.mindMeld}
							{@const mm = consensusData.mindMeld}
							<div class="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 flex items-center gap-4 relative overflow-hidden">
								<div class="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-muted border border-emerald-500/20">
									{#if mm.imageUrl}
										<img src={mm.imageUrl} alt={mm.name} class="w-full h-full object-cover" />
									{/if}
								</div>
								<div class="space-y-1 min-w-0">
									<div class="flex items-center gap-2">
										<span class="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-500 text-white uppercase tracking-wider">
											🤝 Mind Meld
										</span>
									</div>
									<h4 class="font-bold text-base text-foreground truncate">{mm.name}</h4>
									<div class="text-xs text-muted-foreground pt-0.5">
										Unanimous agreement: <strong class="text-emerald-500">{mm.consensusTierName ?? ''} Tier</strong> across all tasters!
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- TAB 1: Consensus Tier List -->
				{#if activeTab === 'consensus'}
					<div class="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm divide-y divide-border/60">
						{#each s.tiers as tier (tier.id)}
							{@const itemsInTier = (consensusData?.consensusItems ?? []).filter(
								(item) => item.consensusTierId === tier.id
							)}
							<div class="flex flex-col sm:flex-row items-stretch min-h-[90px]">
								<!-- Tier Label -->
								<div
									class="w-full sm:w-28 shrink-0 flex items-center justify-center p-3 sm:p-4 font-black text-2xl sm:text-3xl text-white select-none shadow-inner"
									style="background-color: {tier.color};"
								>
									{tier.name}
								</div>

								<!-- Tier Items -->
								<div class="flex-1 p-3 flex flex-wrap items-center gap-3 bg-muted/10 min-h-[70px]">
									{#if itemsInTier.length === 0}
										<span class="text-xs text-muted-foreground/40 italic px-2">No consensus items</span>
									{:else}
										{#each itemsInTier as item (item._id)}
											<div class="group relative w-24 sm:w-28 rounded-xl border border-border bg-card overflow-hidden shadow-sm flex flex-col justify-between">
												<div>
													{#if item.imageUrl}
														<img src={item.imageUrl} alt={item.name} class="w-full h-20 sm:h-24 object-cover bg-muted" />
													{/if}
													<div class="p-1.5">
														<p class="text-[11px] font-bold line-clamp-1 leading-tight text-foreground">{item.name}</p>
													</div>
												</div>
												<div class="p-1 bg-muted/40 text-[9px] text-muted-foreground text-center border-t border-border/30">
													Score: <strong class="text-foreground">{item.averageScore.toFixed(1)}</strong>
												</div>
											</div>
										{/each}
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<!-- TAB 2: Compare All Tasters -->
				{#if activeTab === 'compare'}
					<div class="space-y-4">
						<div class="flex items-center gap-2 overflow-x-auto pb-2">
							{#each rankingList as r, idx (r._id)}
								<button
									onclick={() => (compareUserIndex = idx)}
									class="px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer {compareUserIndex === idx
										? 'bg-primary text-primary-foreground shadow-sm'
										: 'bg-muted text-muted-foreground hover:text-foreground'}"
								>
									{r.userName}'s Board
								</button>
							{/each}
						</div>

						{#if rankingList[compareUserIndex]}
							{@const targetRanking = rankingList[compareUserIndex]}
							{@const targetPlacements = new Map(targetRanking.placements.map((p) => [p.itemId, p.tierId]))}
							<div class="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm divide-y divide-border/60">
								{#each s.tiers as tier (tier.id)}
									{@const placed = itemList.filter((item) => targetPlacements.get(item._id) === tier.id)}
									<div class="flex flex-col sm:flex-row items-stretch min-h-[90px]">
										<div
											class="w-full sm:w-28 shrink-0 flex items-center justify-center p-3 sm:p-4 font-black text-2xl sm:text-3xl text-white select-none shadow-inner"
											style="background-color: {tier.color};"
										>
											{tier.name}
										</div>
										<div class="flex-1 p-3 flex flex-wrap items-center gap-3 bg-muted/10 min-h-[70px]">
											{#if placed.length === 0}
												<span class="text-xs text-muted-foreground/40 italic px-2">No items</span>
											{:else}
												{#each placed as item (item._id)}
													<div class="w-24 sm:w-28 rounded-xl border border-border bg-card overflow-hidden shadow-sm">
														{#if item.imageUrl}
															<img src={item.imageUrl} alt={item.name} class="w-full h-20 sm:h-24 object-cover bg-muted" />
														{/if}
														<div class="p-1.5">
															<p class="text-[11px] font-bold line-clamp-1 leading-tight text-foreground">{item.name}</p>
														</div>
													</div>
												{/each}
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<!-- TAB 3: My Individual Board -->
				{#if activeTab === 'my'}
					<div class="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm divide-y divide-border/60">
						{#each s.tiers as tier (tier.id)}
							{@const placed = itemList.filter((item) => myPlacementMap.get(item._id)?.tierId === tier.id)}
							<div class="flex flex-col sm:flex-row items-stretch min-h-[90px]">
								<div
									class="w-full sm:w-28 shrink-0 flex items-center justify-center p-3 sm:p-4 font-black text-2xl sm:text-3xl text-white select-none shadow-inner"
									style="background-color: {tier.color};"
								>
									{tier.name}
								</div>
								<div class="flex-1 p-3 flex flex-wrap items-center gap-3 bg-muted/10 min-h-[70px]">
									{#if placed.length === 0}
										<span class="text-xs text-muted-foreground/40 italic px-2">No items</span>
									{:else}
										{#each placed as item (item._id)}
											<div class="w-24 sm:w-28 rounded-xl border border-border bg-card overflow-hidden shadow-sm">
												{#if item.imageUrl}
													<img src={item.imageUrl} alt={item.name} class="w-full h-20 sm:h-24 object-cover bg-muted" />
												{/if}
												<div class="p-1.5">
													<p class="text-[11px] font-bold line-clamp-1 leading-tight text-foreground">{item.name}</p>
												</div>
											</div>
										{/each}
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Add Item Photo Modal (Quick Popup Flow) -->
	{#if isAddModalOpen}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
			<div class="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-5 animate-in fade-in-0 zoom-in-95">
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-bold tracking-tight">📸 Add Next Tasting Item</h3>
					<button
						onclick={() => (isAddModalOpen = false)}
						class="text-muted-foreground hover:text-foreground p-1 rounded-lg"
					>
						✕
					</button>
				</div>

				<form onsubmit={handleAddItem} class="space-y-4">
					<!-- Camera / File Picker -->
					<div>
						<span class="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
							Photo (Required)
						</span>
						{#if previewUrl}
							<div class="relative rounded-xl overflow-hidden border border-border h-48 bg-muted">
								<img src={previewUrl} alt="Preview" class="w-full h-full object-cover" />
								<button
									type="button"
									onclick={() => fileInputRef?.click()}
									class="absolute bottom-2 right-2 px-3 py-1.5 rounded-lg bg-background/90 text-xs font-semibold backdrop-blur shadow-sm hover:bg-background"
								>
									Change Photo
								</button>
							</div>
						{:else}
							<button
								type="button"
								onclick={() => fileInputRef?.click()}
								class="w-full h-36 border-2 border-dashed border-border hover:border-primary/50 rounded-xl flex flex-col items-center justify-center gap-2 bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer"
							>
								<span class="text-3xl">📷</span>
								<span class="text-sm font-semibold text-foreground">Snap Photo or Choose Image</span>
								<span class="text-xs text-muted-foreground">Syncs instantly to both screens</span>
							</button>
						{/if}
						<input
							type="file"
							accept="image/*"
							capture="environment"
							bind:this={fileInputRef}
							onchange={handleFileSelect}
							class="hidden"
						/>
					</div>

					<!-- Name / Label Input -->
					<div>
						<label for="item-name" class="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
							Name / Label
						</label>
						<input
							id="item-name"
							type="text"
							bind:value={newItemName}
							placeholder="e.g. Chunky Garlic Dip"
							class="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
						/>
					</div>

					<!-- Notes Input -->
					<div>
						<label for="item-notes" class="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
							Notes (Optional)
						</label>
						<input
							id="item-notes"
							type="text"
							bind:value={newItemNotes}
							placeholder="e.g. $3.99 at Trader Joe's, spicy kick"
							class="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
						/>
					</div>

					{#if uploadError}
						<p class="text-xs text-destructive">{uploadError}</p>
					{/if}

					<div class="flex items-center justify-end gap-2 pt-2">
						<button
							type="button"
							onclick={() => (isAddModalOpen = false)}
							class="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={!selectedFile || isUploading}
							class="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
						>
							{isUploading ? 'Uploading & Syncing...' : 'Add to Tasting'}
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Name Edit Modal -->
	{#if isNameModalOpen}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
			<div class="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4 animate-in fade-in-0 zoom-in-95">
				<h3 class="text-base font-bold tracking-tight">Change Your Taster Name</h3>
				<div>
					<input
						type="text"
						bind:value={tempUserName}
						placeholder="Your Name (e.g. Kerianne, Bryant)"
						class="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
					/>
				</div>
				<div class="flex items-center justify-end gap-2 pt-1">
					<button
						type="button"
						onclick={() => (isNameModalOpen = false)}
						class="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={saveNewName}
						class="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
					>
						Save Name
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}
