/* Settings you can change. */

/* Paste your Apps Script web app link here to get
   an email when someone signs in. Leave "" to turn
   email alerts off. */
export const ALERT_URL = "";

/* false = email only for a NEW user (first sign in).
   true  = email every time someone opens the app
           (at most once per 6 hours per person). */
export const ALERT_EVERY = false;

/* Push notifications (Phase 15).
   VAPID_KEY: Firebase Console > Project settings >
     Cloud Messaging > Web Push certificates > Key pair.
   PUSH_URL: your Apps Script web app link
     (can be the same as ALERT_URL).
   Leave "" to keep notifications off. */
export const VAPID_KEY = "";
export const PUSH_URL = "";
