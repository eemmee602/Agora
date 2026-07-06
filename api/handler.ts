import type { VercelRequest, VercelResponse } from "@vercel/node";

// At runtime on Vercel the bundled backend lives in dist/server.cjs
// (built by the "vercel-build" script). Do NOT import "../server" here,
// because the source .ts file is not shipped to the function runtime.
import { app } from "../dist/server.cjs";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Forward the serverless request to the Express app
  return new Promise<void>((resolve) => {
    (app as any)(req, res, () => {
      resolve();
    });
  });
}
