import { NextFunction, Request, Response } from "express";
import { auth } from "../config/firebase";
import { auth as Auth } from "firebase-admin";

declare global {
  namespace Express {
    interface Request {
      user?: Auth.DecodedIdToken & {
        role?: "user" | "admin";
      };
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const idToken = req.headers.authorization?.split("Bearer ")[1];

  if (!idToken) {
    res.status(403).json({ error: "No token provided" });
    return;
  }

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(403).json({ error: "Invalid token" });
    return;
  }
};

export const checkRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user || !user.role) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
};
