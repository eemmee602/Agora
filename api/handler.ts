import { app } from "../server";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Make Express think it's handling a normal HTTP request
  return new Promise<void>((resolve) => {
    (app as any)(req, res, () => {
      resolve();
    });
  });
}
