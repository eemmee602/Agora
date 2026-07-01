import {Express, Request, Response, NextFunction} from "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role?: string;
        username?: string;
        supabaseId?: string;
      };
    }
  }
}

export {};
