import { migrate, close } from "../lib/store.ts";
try {
  await migrate();
} finally {
  await close();
}
