import { Request, Response } from "express";
import * as authService from "../services/auth.service";

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, registerAdminKey } = req.body;
    await authService.register(email, password, registerAdminKey);
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error("Error registering user", err);
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "Failed to register user" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const userWithToken = await authService.login(email, password);
    res.json(userWithToken);
  } catch (err) {
    console.error("Error logging in user", err);
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "Failed to log in user" });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshToken(refreshToken);
    res.json(tokens);
  } catch (err) {
    console.error("Error refreshing token", err);
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    await authService.forgotPassword(email);
    res.status(200).json({ message: "Reset password email sent successfully" });
  } catch (err) {
    console.error("Error sending reset password email", err);
    res.status(500).json({ error: "Failed to send reset password email" });
  }
};
