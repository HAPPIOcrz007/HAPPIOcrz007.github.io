/* ================================================================
   NOTIFICATION DATA — floating mini-player toast on the hero

   enabled : set false to turn the notification off entirely
   id      : bump this string whenever the message changes so it
             reappears even for visitors who dismissed an older one
             (dismissal is remembered per-id in localStorage)
   emoji   : shown on the left, pick one that matches the mood/context
   header  : short heading (top line, right side)
   context : one or two lines of detail (bottom line, right side)
   link    : optional — "#section" scrolls there, a URL opens a new
             tab, or omit/leave "" for a plain non-clickable toast
================================================================ */
window.DATA_NOTIFICATION = {
  enabled: true,
  id: "2026-07-latest-achievement",
  emoji: "🏆",
  header: "Latest Achievement",
  context: "Just wrapped up a new milestone — check the achievements section for details.",
  link: "#achievements"
};