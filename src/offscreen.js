/**
 * offscreen.js — Bingy audio playback (CLAUDE.md §8)
 *
 * Runs in a hidden offscreen document because MV3 service workers
 * cannot access the Web Audio API directly.
 * Plays a two-tone bing using an oscillator, then signals the background
 * to close this document.
 */

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PLAY_BING') {
    playBing().catch(() => {
      // If playback fails for any reason, still signal the background so
      // the bingInProgress guard is released and future dings can play.
      notifyDone();
    });
  }
});

async function playBing() {
  const ctx = new AudioContext();

  // AudioContext starts in 'suspended' state when created outside a user
  // gesture. resume() transitions it to 'running' so currentTime advances
  // and scheduled events actually fire.
  await ctx.resume();

  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  // A5 (880 Hz) → A4 (440 Hz) sweep over 0.3 s: a classic bell shape
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);

  gain.gain.setValueAtTime(0.5, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.6);

  // Wait for the oscillator to finish, then clean up and signal background.
  osc.onended = () => {
    ctx.close();
    notifyDone();
  };
}

function notifyDone() {
  // Suppress errors: background service worker may have restarted by now.
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_DONE' }, () => {
    void chrome.runtime.lastError;
  });
}
