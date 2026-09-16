import { prune, close } from "../lib/store.ts";
try {
  await prune();
} finally {
  await close();
}
