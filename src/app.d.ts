// See https://svelte.dev/docs/kit/types#app.d.ts
import type { User } from "$lib/server/session";

declare global {
  namespace App {
    interface Locals {
      user: User | null;
    }
  }
}

export {};
