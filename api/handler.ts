import type { VercelRequest, VercelResponse } from "@vercel/node";

// At runtime on Vercel the bundled backend lives in dist/server.cjs
// (built by the "vercel-build" script). Do NOT import "../server" here,
// because the source .ts file is not shipped to the function runtime.
import { app } from "../dist/server.cjs";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Forward the serverless request to the Express app and resolve once the
  // response has been fully written. Express will not call a "next" callback
  // after a matching route sends a response, so we hook res.end() instead.
  return new Promise<void>((resolve, reject) => {
    const originalEnd = res.end.bind(res);
    (res as any).end = function (...args: any[]) {
      originalEnd.apply(res, args);
      resolve();
      return res;
    };

    try {
      (app as any)(req, res, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}
