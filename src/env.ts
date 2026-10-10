import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
  PUBLIC_CONVEX_URL: {
    public: true,
    static: true,
  },
  PUBLIC_CLERK_PUBLISHABLE_KEY: {
    public: true,
    static: true,
  },
  CLERK_SECRET_KEY: {
    public: false,
    static: true,
  },
});
