import { transporter } from "../config/mailer";
import { config } from "../config/env";

export const sendMail = async (
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<void> => {
  const from = `Speak Story <${config.GMAIL_USER}>`;
  await transporter.sendMail({
    from,
    to,
    subject,
    html,
    text,
  });
};

export const sendVerificationEmail = async (email: string, link: string) => {
  const subject = "Verify Your Email";
  // TODO: create a template for this
  const html = `
    <h1>Verify Your Email</h1>
    <p>Please click the following link to verify your email:</p>
    <a href="${link}">${link}</a>
  `;
  await sendMail(email, subject, html);
};

export const sendPasswordResetEmail = async (
  email: string,
  link: string
): Promise<void> => {
  const subject = "Reset Your Password";
  // TODO: create a template for this
  const html = `
    <h1>Reset Password Request</h1>
    <p>Please click the following link to reset your password:</p>
    <a href="${link}">${link}</a>
  `;
  await sendMail(email, subject, html);
};
