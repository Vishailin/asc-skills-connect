// ASC Skills Connect — Notification delivery (spec 2.1 "Notification
// Service": email/SMS/WhatsApp/push for opportunity matches, verification
// status changes, application updates).
//
// No real email/SMS/WhatsApp/push vendor account exists for this
// project, so the default provider just logs to the console and reports
// success — structured as a pluggable interface (one function per
// provider, all with the same shape) so wiring in a real provider
// (SendGrid, Twilio, etc.) later means adding one function to PROVIDERS,
// not touching any caller. This is honestly a stub, not a real delivery
// mechanism — see the README for what "delivered" actually means here.

async function consoleProvider(notification) {
  console.log(`[notify:${notification.channel}] -> learner ${notification.learner_id}: ${notification.message}`);
  return { delivered: true };
}

const PROVIDERS = { console: consoleProvider };
const ACTIVE_PROVIDER = process.env.NOTIFICATION_PROVIDER || "console";

// Returns 'delivered' or 'failed' — never throws, so a notification
// delivery problem can't take down the caller (the matching worker).
async function deliver(notification) {
  const provider = PROVIDERS[ACTIVE_PROVIDER] || consoleProvider;
  try {
    const result = await provider(notification);
    return result.delivered ? "delivered" : "failed";
  } catch (err) {
    console.error("[notifier] delivery failed:", err);
    return "failed";
  }
}

module.exports = { deliver };
