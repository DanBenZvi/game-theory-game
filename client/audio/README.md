# Battle music

Drop your own licensed audio file here, named exactly:

```
client/audio/battle-theme.mp3
```

It will automatically loop as background music for the duration of a
battle (both vs-AI and online), fading in when a battle starts and out
when you leave it, and it responds to the existing mute button. Nothing
else needs to change — `client/js/music.js` looks for that exact path.

**You need to supply this file yourself.** This project doesn't ship
with any music because most tracks worth using (film/TV scores, popular
songs, etc.) are copyrighted — including the "Main Title" theme
requested for this game. Use a file you have the rights to: something
you purchased, a track under a license that permits this use (e.g.
Creative Commons / royalty-free), or your own composition.

If no file is present, the game runs normally with no background music
— sound effects and the ocean ambience are unaffected.
