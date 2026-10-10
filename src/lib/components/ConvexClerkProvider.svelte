<script lang="ts">
import { setupAuth, setupConvex } from 'convex-svelte';
import type { Snippet } from 'svelte';
import { useClerkContext } from 'svelte-clerk/client';

const props: {
  children: Snippet;
  convexUrl: string;
} = $props();

setupConvex(props.convexUrl);
const ctx = useClerkContext();

setupAuth(() => ({
  isLoading: !ctx.isLoaded,
  isAuthenticated: !!ctx.session,
  fetchAccessToken: async ({ forceRefreshToken }) => {
    if (!ctx.isLoaded || !ctx.session) return null;
    return (
      (await ctx.session.getToken({
        template: 'convex',
        skipCache: forceRefreshToken,
      })) ?? null
    );
  },
}));
</script>

{@render props.children()}
