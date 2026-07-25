# Battle music

Background music is now **fully procedural** — generated at runtime by
`client/js/music.js` with WebAudio, the same technique used for the sound
effects in `client/js/sound.js`. There's no audio file to add here
anymore, nothing to license, and nothing that needs to travel with the
repo — it works identically in dev and in any deployment.

This directory is kept around (and still gitignored below) only as a
safety net, in case an earlier local experiment left an audio file
sitting here — it won't be picked up by anything and won't get
accidentally committed.

If you'd rather use a real licensed/purchased track instead of the
synthesized one, that's a straightforward swap in `client/js/music.js`
(replace the scheduler with an `<audio>` element pointing at your file)
— ask and it can be wired back up the same way it was before.
