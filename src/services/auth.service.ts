import { UserRecord } from "firebase-admin/lib/auth/user-record";
import { auth } from "../config/firebase";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email.service";
import axios from "axios";
import { config } from "../config/env";

export const register = async (
  email: string,
  password: string,
  registerAdminKey?: string
): Promise<UserRecord> => {
  const user = await auth.createUser({
    email,
    password,
  });
  const role =
    registerAdminKey &&
    config.REGISTER_ADMIN_KEY &&
    registerAdminKey === config.REGISTER_ADMIN_KEY
      ? "admin"
      : "user";

  await auth.setCustomUserClaims(user.uid, { role });
  const verificationLink = await auth.generateEmailVerificationLink(email);
  await sendVerificationEmail(email, verificationLink);

  return user;
};

export const login = async (email: string, password: string) => {
  try {
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.FIREBASE_WEB_API_KEY}`,
      {
        email,
        password,
        returnSecureToken: true,
      }
    );
    const decodedToken = await auth.verifyIdToken(response?.data?.idToken);

    if (!decodedToken?.email_verified) {
      throw new Error("Email not verified");
    }

    return {
      token: response.data.idToken,
      refreshToken: response.data.refreshToken,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: decodedToken?.role || "user",
      },
    };
  } catch (error: any) {
    if (error.response) {
      const firebaseError = error.response.data.error.message;
      switch (firebaseError) {
        case "USER_DISABLED":
          throw new Error("User account is disabled");
        case "TOO_MANY_ATTEMPTS_TRY_LATER":
          throw new Error("Too many attempts. Please try again later");
        case "INVALID_LOGIN_CREDENTIALS":
          throw new Error("Incorrect login credentials.");
        default:
          throw new Error("An unknown error occurred during login");
      }
    } else if (error.code === "auth/argument-error") {
      throw new Error("Invalid token received");
    } else {
      throw new Error("An unexpected error occurred");
    }
  }
};

export const refreshToken = async (refreshToken: string) => {
  const response = await axios.post(
    `https://securetoken.googleapis.com/v1/token?key=${config.FIREBASE_WEB_API_KEY}`,
    `grant_type=refresh_token&refresh_token=${refreshToken}`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );

  return {
    token: response?.data?.id_token,
    refreshToken: response?.data?.refresh_token,
  };
};

export const forgotPassword = async (email: string) => {
  const user = await auth.getUserByEmail(email);
  if (!user) {
    throw new Error("User not found");
  }
  const passwordResetLink = await auth.generatePasswordResetLink(email);
  await sendPasswordResetEmail(email, passwordResetLink);
};
