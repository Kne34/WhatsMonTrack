/**
 * Messages delivered as 'append' (the queue of messages sent while the bot was offline) older than
 * this are not processed. Configurable because a free host that sleeps may be offline for days;
 * re-deliveries are harmless either way (each WhatsApp message is recorded at most once).
 */
export function appendMaxAgeMs(env: NodeJS.ProcessEnv = process.env) {
  const hours = Number(env.WA_OFFLINE_MAX_AGE_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : 72) * 60 * 60 * 1000;
}
