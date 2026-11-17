# Sprechen 🇩🇪: speak German fluently by March

A mobile app (installable web app / PWA) built around one goal: **talking German naturally, without getting stuck**. It has no grammar tables and no level tests. You speak out loud every day for about 20 minutes.

## What's inside

| | |
|---|---|
| ▶ **One-tap daily session** | Warm-up shadowing → speak drill → real conversation. One button, about 20 minutes. |
| 🎧 **Shadowing** | Hear a native-style phrase (normal or 🐢 slow) and repeat it. The mic scores your pronunciation word by word. |
| 🎯 **Speak drill** | You see English and say the German out loud. Spaced repetition brings each phrase back just before you'd forget it. |
| 🗣️ **AI conversation partner** | 13 real-life situations (café, doctor, flat viewing, job interview, debates…). It's voice in and voice out, hands-free. Gentle corrections appear under what you said. |
| 🆘 **Never get stuck** | **Stuck?** shows 3 things you could say next. The **EN mic** lets you say it in English and get the German back. |
| ⏱️ **Speak 60 sec** | Talk non-stop on a topic. Works offline, and you can ask the AI for feedback afterwards. |
| ⭐ **Your own deck** | Useful phrases from your conversations are saved and drilled automatically. You can add your own too. |
| 📈 **Progress** | Streak, minutes, sentences spoken, a 10-week heatmap, and a 5-phase road to your goal date. |

The phrase bank has about 210 high-frequency spoken chunks. It starts with **rescue phrases** ("Moment, ich überlege kurz…") and **natural-flow fillers** ("also", "na ja", "ehrlich gesagt"), because these make you sound fluent fastest.

## Use it on your phone

1. Open the app URL in **Chrome (Android)** or **Safari (iPhone)**.
2. Add it to the home screen: Chrome menu → *Install app* / *Add to Home screen*, or Safari Share → *Add to Home Screen*.
3. Allow the microphone when asked.
4. Optional, for the AI partner: open ⚙️ Settings and paste a Claude API key from [console.anthropic.com](https://console.anthropic.com). The key is stored only on your phone and is sent only to Anthropic's API.

Tip: if the voice sounds robotic, install a German text-to-speech voice. On Android: Settings → Text-to-speech. On iPhone: Settings → Accessibility → Spoken Content → Voices → German. Then pick it in Settings.

## Deploy (GitHub Pages)

The workflow in `.github/workflows/pages.yml` builds and publishes the app whenever `main` is pushed.
In the repository, go to **Settings → Pages → Source: GitHub Actions**. The app will then be live at `https://<user>.github.io/<repo>/`.

## Develop

```bash
npm install
npm run dev      # open the shown URL on your phone (same Wi-Fi)
npm run build    # type-check + production build into dist/
```

Built with plain TypeScript and Vite. Speech uses the browser's Web Speech API. The AI partner uses the Anthropic SDK (Claude Opus 5.5 by default; Sonnet/Haiku are selectable for speed and cost).
