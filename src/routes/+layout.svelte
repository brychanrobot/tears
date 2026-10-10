<script lang="ts">
import '../app.css';
import type { Snippet } from 'svelte';
import { ClerkProvider, Show, SignInButton, UserButton } from 'svelte-clerk';
import ConvexClerkProvider from '#lib/components/ConvexClerkProvider.svelte';
import { PUBLIC_CLERK_PUBLISHABLE_KEY, PUBLIC_CONVEX_URL } from '$app/env/public';

const { children }: { children: Snippet } = $props();

const convexUrl =
  PUBLIC_CONVEX_URL || (typeof process !== 'undefined' ? process.env?.PUBLIC_CONVEX_URL : '') || '';
const clerkPubKey =
  PUBLIC_CLERK_PUBLISHABLE_KEY ||
  (typeof process !== 'undefined' ? process.env?.PUBLIC_CLERK_PUBLISHABLE_KEY : '') ||
  '';
</script>

<svelte:head>
	<title>Tears — Real-Time Taste Tests & Tier Lists</title>
	<meta name="description" content="Collaborative taste-testing and real-time tier lists with Kerianne and friends." />
</svelte:head>

<ClerkProvider publishableKey={clerkPubKey}>
	<ConvexClerkProvider {convexUrl}>
	<div class="min-h-screen flex flex-col bg-background text-foreground antialiased selection:bg-primary selection:text-primary-foreground">
		<header class="sticky top-0 z-50 w-full border-b border-border/50 bg-background/90 backdrop-blur-md">
			<div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
				<a href="/" class="flex items-center gap-2.5 font-black text-xl tracking-tight hover:opacity-90 transition-opacity">
					<span class="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white shadow-sm shadow-rose-500/20 text-lg">
						👅
					</span>
					<span class="bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text">
						Tears
					</span>
				</a>

				<nav class="flex items-center gap-3">
					<a
						href="/"
						class="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted/50"
					>
						Sessions
					</a>
					<Show when="signed-out">
						<SignInButton
							mode="modal"
							class="inline-flex items-center justify-center rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 transition-all shadow-sm cursor-pointer"
						>
							Sign In
						</SignInButton>
					</Show>
					<Show when="signed-in">
						<div class="flex items-center gap-2 pl-1">
							<UserButton afterSignOutUrl="/" />
						</div>
					</Show>
				</nav>
			</div>
		</header>

		<main class="flex-1 max-w-6xl w-full mx-auto px-4 py-6 md:py-8">
			{@render children?.()}
		</main>

		<footer class="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
			<div class="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
				<p>Tears — The collaborative, real-time taste-testing & tier list platform</p>
				<p class="text-muted-foreground/80">Built with SvelteKit, Convex & Clerk</p>
			</div>
		</footer>
	</div>
	</ConvexClerkProvider>
</ClerkProvider>
