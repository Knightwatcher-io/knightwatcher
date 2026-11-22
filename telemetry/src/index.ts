/**
 * The Worker's entry. The runtime reads every export of this module as an entrypoint, so it
 * exports the handler alone; everything else is in receive.ts and payload.ts.
 */

import { handle, type Env } from "./receive.ts";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env, Date.now());
  },
} satisfies ExportedHandler<Env>;
