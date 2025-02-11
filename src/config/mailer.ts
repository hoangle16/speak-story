import * as nodemailer from "nodemailer";
import { config } from "./env";

export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: config.GMAIL_USER,
    pass: config.GMAIL_PASSWORD,
  },
});
