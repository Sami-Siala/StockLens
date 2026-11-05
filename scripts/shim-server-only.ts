/**
 * `server-only` throws when imported outside Next's "react-server" condition, which is exactly
 * where scripts (tsx) and tests run. Import this FIRST in a script to neutralise it:
 *
 *   import "./shim-server-only";
 *
 * (Vitest tests use vi.mock("server-only") instead.)
 */
const id = require.resolve("server-only");
require.cache[id] = {
  id,
  filename: id,
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;
