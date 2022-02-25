import type Mail from "nodemailer/lib/mailer";
import nodemailer from "nodemailer";
import { env } from "./env";
import { marked } from "marked";
import { log, logStderr } from "@core/lib/utils/logger";
import { newMemoryQueue } from "./memory_queue";

type CustomEmail = {
  to: string;
  subject: string;
  bodyMarkdown: string;
};

const PlainTextRenderer = require("marked-plaintext");
const plainTextRenderer = new PlainTextRenderer();

// Note: we cannot use nodemailer's SES well-known transport due to our VPC configuration, which
// would have supported throttling via `sendingRate` prop (which isn't available for other
// built-ins or direct transport, which we use).

const emailsPerSecond = parseInt(env.EMAILS_PER_SECOND || "10", 10);
const maxMailRetryCount = 4;
// default SES limit is 1 email per sec, 200 per day, which customers may have on first launch
const { enqueue: enqueueFailedEmail } = newMemoryQueue(
  "email-retry-queue",
  5000,
  0,
  Math.ceil(emailsPerSecond / 2),
  maxMailRetryCount
);

const { enqueue: enqueueBulkEmail } = newMemoryQueue(
  "email-bulk-queue",
  5000,
  1050,
  Math.ceil(emailsPerSecond / 2),
  maxMailRetryCount
);

const asyncVerify = () =>
  new Promise<void>((resolve, reject) => {
    transporter?.verify((err) => (err ? reject(err) : resolve()));
  });

const verifySMTP = async () => {
  try {
    await asyncVerify();
    log("SMTP settings were verified successfully.");
  } catch (err) {
    logStderr("SMTP settings failed to be verified.", { err });
  }
};

let transporter: Mail | undefined;

export const registerEmailTransporter = (
  transporterArg: typeof transporter
) => {
  transporter = transporterArg;
  if (transporter) {
    verifySMTP();
  }
};

export const getCommunityTransporter = () => {
  let _transporter: Mail | undefined;
  if (env.SMTP_TRANSPORT_JSON) {
    _transporter = nodemailer.createTransport(
      JSON.parse(env.SMTP_TRANSPORT_JSON)
    );
  } else if (env.NODE_ENV == "development") {
    log("SMTP disabled. Won't send emails in development.");
  } else {
    throw new Error("Missing SMTP credentials.");
  }

  return _transporter;
};

// sendEmail will immediately attempt to send the mail, then queue retries if it fails
export const sendEmail = async (email: CustomEmail) => {
  const { to, subject, bodyMarkdown } = email;
  const emailData = {
    to,
    from: `EnvKey <${process.env.SENDER_EMAIL}>`,
    subject,
    text: marked(bodyMarkdown, { renderer: plainTextRenderer }),
    html: marked(bodyMarkdown),
  };

  if (!transporter) {
    if (env.NODE_ENV != "development") {
      throw new Error("Missing SMTP credentials.");
    }

    console.log("Not sending email in dev mode. Data:");
    console.log(JSON.stringify(emailData, null, 2));
    return;
  }

  // send email immediately, but queue to retry on failure

  log("Sending email immediately", { to, subject });
  return transporter.sendMail(emailData).catch((err) => {
    const task = async () => transporter?.sendMail(emailData);
    task.toString = () => `sendEmail(${JSON.stringify(email)})`;

    logStderr("Initial sendEmail failed, queuing for later.", { err, task });

    enqueueFailedEmail(task);
  });
};

// sendBulkEmail will put the email into the bulk outgoing queue to be delivered serially
export const sendBulkEmail = async (email: CustomEmail) => {
  const { to, subject, bodyMarkdown } = email;
  const emailData = {
    to,
    from: `EnvKey <${process.env.SENDER_EMAIL}>`,
    subject,
    text: marked(bodyMarkdown, { renderer: plainTextRenderer }),
    html: marked(bodyMarkdown),
  };

  if (!transporter) {
    if (env.NODE_ENV != "development") {
      throw new Error("Missing SMTP credentials.");
    }

    console.log("Not sending bulk email in dev mode. Data:");
    console.log(JSON.stringify(emailData, null, 2));
    return;
  }

  const task = async () => transporter?.sendMail(emailData);
  task.toString = () => `sendBulkEmail(${JSON.stringify(email)})`;
  enqueueBulkEmail(task);
  log("Enqueued bulk email", { to, subject });
};
