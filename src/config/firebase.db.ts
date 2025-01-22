import admin, { ServiceAccount } from "firebase-admin";
import { config } from "./env";

admin.initializeApp({
  credential: admin.credential.cert(
    config.FIREBASE_SERVICE_ACCOUNT as ServiceAccount
  ),
  databaseURL: config.FIREBASE_DATABASE_URL,
});

export const db = admin.database();
