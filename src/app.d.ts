/// <reference types="svelte-clerk/env" />

declare module '$env/static/public' {
  export const PUBLIC_CONVEX_URL: string;
  export const PUBLIC_CLERK_PUBLISHABLE_KEY: string;
}

declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
