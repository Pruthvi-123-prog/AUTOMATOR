# VTU Automator

A local web app that automates lecture completion on the [VTU OPEC/PEC online portal](https://online.vtu.ac.in). Log in once with your VTU credentials and let it mark your lectures as watched — with live per-lecture progress right in the browser.

> [!CAUTION]
> **⚠️ FOR EDUCATIONAL USE ONLY — DO NOT ABUSE**
>
> This tool is built **SOLELY** for educational and personal learning purposes. It is strictly intended to help students track and complete self-paced online lectures they are genuinely enrolled in.
> **DO NOT** abuse, misuse, or exploit this script to bypass academic integrity, gain unfair advantages, or violate VTU's terms of service.
> The author takes **NO responsibility** for any consequences arising from misuse. Use responsibly.

---

## Features

- **One-click login** — uses your real VTU portal credentials; no token hunting required
- **Live dashboard** — course progress bars update in real time as lectures complete
- **Resumes correctly** — picks up from where each lecture actually left off (no false starts)
- **Stops at 100%** — never over-reports; already-completed lectures are skipped instantly
- **Token refresh** — if your session expires mid-fill, it re-authenticates automatically and shows a clear message instead of silently hanging
- **Parallel processing** — completes multiple lectures simultaneously (configurable)
- **Saved accounts** — remembers credentials locally so you don't retype them

---

## Requirements

- [Node.js](https://nodejs.org) **v18 or newer**
- Internet connection (for VTU portal access)

---

## Installation & Quick Start

### Windows (double-click, no terminal needed)

```
install.bat
```

That's it. The script installs everything and opens your browser automatically.

---

### Linux / macOS (one command)

```bash
chmod +x install.sh && ./install.sh
```

---

### Manual (for developers)

```bash
# 1. Install dependencies
npm install

# 2. Install the Playwright browser used for login
npx playwright install chromium --with-deps

# 3. Start the app (opens browser automatically)
npm start
```

Then open **http://127.0.0.1:5000** in your browser if it doesn't open automatically.

---

## Usage

1. **Run** `install.bat` (Windows) or `./install.sh` (Linux/Mac) — your browser opens automatically.
2. **Log in** with your VTU portal email and password.
3. Your **enrolled courses** appear with their current progress.
4. Click **Fill** on any course — a live progress panel shows each lecture updating in real time.
5. The dashboard card updates live. When done, the course shows **100%**.

> The browser window that appears during login is the real VTU portal — this is how your session token is securely obtained without storing passwords in plaintext in memory.

---

## Configuration (optional)

All settings are optional. Copy `.env.example` to `.env` to customise:

| Variable | Default | Description |
|---|---|---|
| `PARALLEL_LIMIT` | `3` | Lectures completed simultaneously |
| `CHUNK_SECONDS` | `10` | Progress reported every N seconds |
| `DELAY_MS` | `250` | Delay between requests (ms) |
| `FINAL_DELAY` | `1200` | Extra delay at >90% completion (ms) |
| `PORT` | `5000` | Local server port |
| `HEADLESS` | `false` | Hide the login browser window |

---

## Project Structure

```
vtu-automator/
├── server.js        ← Express API server
├── automation.js    ← VTU portal automation logic
├── launch.js        ← Starts server + opens browser
├── public/
│   ├── index.html   ← UI
│   ├── app.js       ← Frontend logic
│   └── style.css    ← Styles
├── install.bat      ← Windows one-click setup
├── install.sh       ← Linux/Mac one-click setup
├── .env.example     ← Configuration template
└── package.json
```

---

## How It Works

1. **Login**: Playwright opens a headless (or visible) Chromium browser, logs into the VTU portal, and extracts the session token from cookies.
2. **Fetch courses**: The token is used to call VTU's API and list your enrolled courses with real progress.
3. **Fill lectures**: For each incomplete lecture, the app sends incremental progress updates to the VTU API (simulating a student watching the video) until the server confirms 100% completion.
4. **Live UI**: A Server-Sent Events (SSE) stream pushes real-time updates from the server to your browser — no polling, instant feedback.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Browser doesn't open | Visit `http://127.0.0.1:5000` manually |
| Login fails | Double-check your VTU portal credentials |
| Session expired mid-fill | Close the modal, refresh the page, log in again |
| `npm install` fails | Ensure you have Node.js v18+ and an internet connection |
| Playwright install fails | Run `npx playwright install chromium` manually |

---

## Legal & Ethical Notice

This project interacts with a publicly accessible web portal using credentials that belong to the end user. It does not bypass authentication, exploit vulnerabilities, or access any data the user is not authorized to view. All API calls made are identical to those a browser would make during normal use.

**This tool is for educational use only. Misuse is entirely at the user's own risk.**

---

## Acknowledgements

### 🌟 Special Contribution

A huge thank you to **[Sumith](https://github.com/Sumith-030cd)** for their invaluable contribution to this project.

Their insights, feedback, and collaboration played a key role in shaping the direction of this tool. This project wouldn't be what it is without their support.

> *"Great things are never done alone."*

---

## License

MIT — see [LICENSE](LICENSE) for details.
