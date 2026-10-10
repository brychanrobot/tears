import { withClerkHandler } from 'svelte-clerk/server';

export const handle = withClerkHandler({
  publishableKey: process.env.PUBLIC_CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
});
