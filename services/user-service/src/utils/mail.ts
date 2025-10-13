import nodemailer from "nodemailer";
import { VERIFY_TTL_SECONDS } from "../controller/helpers/email-resend-helpers";
import { RESET_TTL_SECONDS } from "./teacher-auth-utils";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

export const sendVerificationEmail = async (
  email: string,
  username: string,
  verificationCode: string
) => {
  return transporter.sendMail(
    makeVerificationEmail(email, username, verificationCode)
  );
};

export const sendVerificationEmailForEmailChange = async (
  email: string,
  username: string,
  verificationCode: string
) => {
  return transporter.sendMail(
    makeVerificationEmailForEmailChange(email, username, verificationCode)
  );
};

export const sendPasswordResetLink = async (
  email: string,
  username: string,
  resetLink: string
): Promise<void> => {
  await transporter.sendMail(
    makePasswordResetEmail(email, username, resetLink)
  );
};

const emailAddress = process.env.GMAIL_USER;
const emailName = process.env.GMAIL_NAME;
const appName = process.env.APP_NAME;

const makePasswordResetEmail = (
  email: string,
  username: string,
  resetLink: string
) => ({
  from: `"${emailName}" <${emailAddress}>`,
  to: email,
  subject: `Reset Your ${appName} Password`,
  html: `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
    <h2 style="text-align: center; color: #556cd6;">Reset Your Password</h2>
    <p style="font-size: 16px;">Hello <span style="color: #556cd6; font-weight: bold;">${username}</span>,</p>
    <p style="font-size: 16px;">We received a request to reset your password. Click the button below to create a new password:</p>
    <div style="text-align: center; margin: 20px 0;">
        <a href="${resetLink}" style="background-color: #556cd6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
    </div>
    <p style="font-size: 16px;">This link will expire in ${
      RESET_TTL_SECONDS / 60
    } minutes for security reasons.</p>
    <p style="font-size: 14px;">If the button doesn't work, you can copy and paste this link into your browser:</p>
    <a href="${resetLink}" style="font-size: 14px; word-break: break-all; color: #556cd6;">${resetLink}</a>
    <p style="font-size: 14px; color: #777;">If you did not request a password reset, please ignore this email and ensure your account is secure.</p>
    <hr style="border-top: 1px solid #eee; margin: 20px 0;">
    <p style="font-size: 14px; text-align: center; color: #aaa;">This is an automated message. Please do not reply.</p>
    </div>
  `,
});

const makeVerificationEmail = (
  email: string,
  username: string,
  verificationCode: string
) => ({
  from: `"${emailName}" <${emailAddress}>`,
  to: email,
  subject: `Confirm your ${appName} Account`,
  html: `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
    <h2 style="text-align: center; color: #556cd6;">Confirm Your Account</h2>
    <p style="font-size: 16px;">Hello <span style="color: #556cd6; font-weight: bold;">${username}</span>,</p>
    <p style="font-size: 16px;">Thank you for signing up! To complete your registration, please use the following verification code:</p>
    <div style="text-align: center; margin: 20px 0;">
      <span style="font-size: 24px; font-weight: bold; color: #556cd6; background-color: #f4f4f4; padding: 10px 20px; border-radius: 5px;">${verificationCode}</span>
    </div>
    <p style="font-size: 16px;">Please enter this code in the verification section to confirm your account.</p>
    <p style="font-size: 14px; color: #777;">This code will expire in ${
      VERIFY_TTL_SECONDS / 60
    } minutes.</p>
    <p style="font-size: 14px; color: #777;">If you did not sign up for this account, please disregard this email.</p>
    <hr style="border-top: 1px solid #eee; margin: 20px 0;">
    <p style="font-size: 14px; text-align: center; color: #aaa;">This is an automated message. Please do not reply.</p>
    </div>
  `,
});

export const makeVerificationEmailForEmailChange = (
  email: string,
  username: string,
  verificationCode: string
) => ({
  from: `"${emailName}" <${emailAddress}>`,
  to: email,
  subject: `Confirm your new email for ${appName}`,
  html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="text-align: center; color: #556cd6;">Confirm your new email</h2>
      <p style="font-size: 16px;">Hello <span style="color: #556cd6; font-weight: bold;">${username}</span>,</p>
      <p style="font-size: 16px;">To complete changing your email account, please use the following verification code:</p>
      <div style="text-align: center; margin: 20px 0;">
        <span style="font-size: 24px; font-weight: bold; color: #556cd6; background-color: #f4f4f4; padding: 10px 20px; border-radius: 5px;">${verificationCode}</span>
      </div>
      <p style="font-size: 16px;">Please enter this code in the verification section to confirm your email change.</p>
      <p style="font-size: 14px; color: #777;">This code will expire in ${
        VERIFY_TTL_SECONDS / 60
      } minutes.</p>
      <p style="font-size: 14px; color: #777;">If you did not make this request, please disregard this email.</p>
      <hr style="border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 14px; text-align: center; color: #aaa;">This is an automated message. Please do not reply.</p>
      </div>
    `,
});
