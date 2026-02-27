## LLM Provider Setup Guide

```
Settings → LLM → [+ Add Provider]
```

This page walks players through connecting an LLM provider. Iron Curtain does not include an AI model — you bring your own (BYOLLM). All LLM features are optional; the game is fully functional without one.

### What You Need

An LLM provider is a service that runs an AI model and answers questions. You have two options:

| Option | Cost | Speed | Privacy | Setup Difficulty |
|--------|------|-------|---------|-----------------|
| **Local (Ollama)** | Free | Fast (your hardware) | Full — nothing leaves your machine | Medium (install one app) |
| **Cloud (OpenAI, Claude, etc.)** | Pay-per-use | Fast (their hardware) | Prompts sent to provider | Easy (get an API key) |

Both work identically in-game. You can use one for some tasks and another for others (task routing).

---

### Option A: Local Setup with Ollama (Free, Private)

Ollama runs AI models on your own computer. No account needed, no API key, no cost.

**Step 1 — Install Ollama**

Download from [ollama.com](https://ollama.com) and install. It runs as a background service.

**Step 2 — Pull a model**

Open a terminal and run:

```
ollama pull llama3.2
```

This downloads a ~4 GB model. Smaller models (`llama3.2:1b`, ~1.3 GB) work too but give lower quality strategic advice. Larger models (`llama3.1:70b`) give better advice but require more RAM/VRAM.

| Model | Size | RAM Needed | Quality | Best For |
|-------|------|-----------|---------|----------|
| `llama3.2:1b` | 1.3 GB | 4 GB | Basic | Low-end machines, fast responses |
| `llama3.2` (8B) | 4.7 GB | 8 GB | Good | Most players |
| `llama3.1:70b` | 40 GB | 48 GB | Excellent | High-end machines, best strategy |
| `qwen2.5:7b` | 4.4 GB | 8 GB | Good | Alternative to Llama |
| `mistral` (7B) | 4.1 GB | 8 GB | Good | Alternative to Llama |

**Step 3 — Verify Ollama is running**

```
ollama list
```

If you see your model listed, Ollama is ready.

**Step 4 — Add in Iron Curtain**

1. Open Settings → LLM → [+ Add Provider]
2. Select **Ollama** from the provider type dropdown
3. Endpoint: `http://localhost:11434` (default, pre-filled)
4. Model: type the model name (e.g., `llama3.2`)
5. Click [Test Connection]
6. If the test passes, click [Save]

```
┌──────────────────────────────────────────────────────────┐
│  ADD LLM PROVIDER                              [Cancel]   │
│                                                           │
│  Provider Type:  [Ollama           ▾]                     │
│  Name:           [My Local Ollama    ]                    │
│  Endpoint:       [http://localhost:11434]                  │
│  Model:          [llama3.2           ]                    │
│  API Key:        (not needed for Ollama)                  │
│                                                           │
│  [Test Connection]                                        │
│                                                           │
│  ✓ Connected — llama3.2 loaded, 340ms latency             │
│                                                           │
│  [Save Provider]                                          │
└──────────────────────────────────────────────────────────┘
```

No API key needed. No account needed. Everything stays on your machine.

---

### Option B: OpenAI (ChatGPT) Setup

Uses OpenAI's cloud API. Requires an account and API key. Pay-per-use (typically a few cents per game session with the orchestrator AI).

**Step 1 — Get an API key**

1. Go to [platform.openai.com](https://platform.openai.com)
2. Create an account (or sign in)
3. Navigate to API Keys → [+ Create new secret key]
4. Copy the key (starts with `sk-...`)
5. Add credit to your account (Settings → Billing — minimum $5)

**Step 2 — Add in Iron Curtain**

1. Open Settings → LLM → [+ Add Provider]
2. Select **OpenAI** from the provider type dropdown
3. Endpoint: `https://api.openai.com/v1` (default, pre-filled)
4. Model: `gpt-4o-mini` (recommended — cheapest good model) or `gpt-4o` (best quality, ~10x cost)
5. API Key: paste your `sk-...` key
6. Click [Test Connection]
7. If the test passes, click [Save]

```
┌──────────────────────────────────────────────────────────┐
│  ADD LLM PROVIDER                              [Cancel]   │
│                                                           │
│  Provider Type:  [OpenAI           ▾]                     │
│  Name:           [My OpenAI          ]                    │
│  Endpoint:       [https://api.openai.com/v1]              │
│  Model:          [gpt-4o-mini        ]                    │
│  API Key:        [sk-••••••••••••••••] [Show]             │
│                                                           │
│  [Test Connection]                                        │
│                                                           │
│  ✓ Connected — gpt-4o-mini, 280ms latency, ~$0.01/consult│
│                                                           │
│  [Save Provider]                                          │
└──────────────────────────────────────────────────────────┘
```

| Model | Cost per Consultation | Quality | Context Window |
|-------|----------------------|---------|----------------|
| `gpt-4o-mini` | ~$0.005 | Good | 128k tokens |
| `gpt-4o` | ~$0.05 | Excellent | 128k tokens |
| `o4-mini` | ~$0.02 | Very good (reasoning) | 200k tokens |

**Approximate cost per game session** (10 orchestrator consultations): $0.05–$0.50 depending on model.

**Your API key is encrypted** on your machine (OS credential manager) and never shared — not in exports, not in replays, not in Workshop configs.

---

### Option C: Anthropic Claude Setup

Uses Anthropic's cloud API. Same pattern as OpenAI — account, API key, pay-per-use.

**Step 1 — Get an API key**

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account (or sign in)
3. Navigate to API Keys → [Create Key]
4. Copy the key (starts with `sk-ant-...`)
5. Add credit (Settings → Billing)

**Step 2 — Add in Iron Curtain**

1. Open Settings → LLM → [+ Add Provider]
2. Select **Anthropic** from the provider type dropdown
3. Model: `claude-sonnet-4-20250514` (recommended) or `claude-haiku-4-5-20251001` (cheaper, faster)
4. API Key: paste your `sk-ant-...` key
5. Click [Test Connection]
6. If the test passes, click [Save]

| Model | Cost per Consultation | Quality | Context Window |
|-------|----------------------|---------|----------------|
| `claude-haiku-4-5-20251001` | ~$0.005 | Good | 200k tokens |
| `claude-sonnet-4-20250514` | ~$0.03 | Excellent | 200k tokens |

---

### Option D: Google Gemini Setup

Google Gemini exposes an OpenAI-compatible API. Free tier available.

**Step 1 — Get an API key**

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with a Google account
3. Click "Get API key" → "Create API key"
4. Copy the key

**Step 2 — Add in Iron Curtain**

1. Open Settings → LLM → [+ Add Provider]
2. Select **OpenAI Compatible** from the provider type dropdown
3. Endpoint: `https://generativelanguage.googleapis.com/v1beta/openai`
4. Model: `gemini-2.0-flash` (free tier, fast) or `gemini-2.5-pro` (paid, best quality)
5. API Key: paste your Google AI key
6. Click [Test Connection]

| Model | Cost per Consultation | Quality | Notes |
|-------|----------------------|---------|-------|
| `gemini-2.0-flash` | Free (rate limited) | Good | Great starting point |
| `gemini-2.5-pro` | ~$0.02 | Excellent | Best Google model |

---

### Option E: Other OpenAI-Compatible Services

Many services use the same API format as OpenAI. Use **OpenAI Compatible** provider type with these settings:

| Service | Endpoint | Example Model | Notes |
|---------|----------|---------------|-------|
| **Groq** | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Very fast, free tier |
| **Together.ai** | `https://api.together.xyz/v1` | `meta-llama/Llama-3.1-70B-Instruct-Turbo` | Open models on cloud |
| **OpenRouter** | `https://openrouter.ai/api/v1` | `anthropic/claude-sonnet-4` | Routes to many providers |
| **Fireworks** | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p1-70b-instruct` | Fast open models |

Get an API key from the service's website, then add as OpenAI Compatible in Iron Curtain.

---

### Task Routing — Use Different Providers for Different Tasks

After adding one or more providers, you can assign them to specific tasks:

```
┌──────────────────────────────────────────────────────┐
│  TASK ROUTING                                         │
│                                                       │
│  Task                    Provider                     │
│  ──────────────────────  ────────────────────────     │
│  AI Orchestrator         [My Local Ollama      ▾]     │
│  Mission Generation      [My OpenAI            ▾]     │
│  Campaign Briefings      [My OpenAI            ▾]     │
│  Post-Match Coaching     [My Local Ollama      ▾]     │
│  Asset Generation        [My OpenAI            ▾]     │
│                                                       │
│  [Save Routing]                                       │
└──────────────────────────────────────────────────────┘
```

**Recommended routing for players with both local and cloud:**

| Task | Recommended Provider | Why |
|------|---------------------|-----|
| AI Orchestrator | Local (Ollama) | Called every ~10s during gameplay — latency matters, cost adds up |
| Mission Generation | Cloud (GPT-4o / Claude) | Called once per mission — quality matters more than speed |
| Campaign Briefings | Cloud | Creative writing benefits from larger models |
| Post-Match Coaching | Either | One call per match — either works well |

---

### Community Configs — Skip the Setup

Don't want to configure everything yourself? Browse community-tested configurations:

1. Settings → LLM → [Browse Community Configs]
2. Browse by tag: `local-only`, `budget`, `high-quality`, `fast`
3. Click [Import] on a config you like
4. The config pre-fills provider settings and task routing — you only need to add your own API keys

Community configs never include API keys. They share everything else: endpoint URLs, model names, prompt profiles, and task routing.

---

### Troubleshooting

| Problem | Solution |
|---------|----------|
| "Connection refused" (Ollama) | Is Ollama running? Check `ollama list` in terminal. Restart Ollama if needed. |
| "401 Unauthorized" (Cloud) | API key is wrong or expired. Generate a new one from the provider's dashboard. |
| "429 Too Many Requests" | You've hit the provider's rate limit. Wait a minute, or switch to a different provider for high-frequency tasks. |
| "Model not found" (Ollama) | Run `ollama pull <model-name>` to download the model first. |
| "Timeout" | The model is too slow for the timeout setting. Try a smaller/faster model, or increase timeout in provider settings. |
| Responses are low quality | Try a larger model. `llama3.2:1b` is fast but basic; `gpt-4o` or `claude-sonnet-4` give much better strategic advice. |
| High cloud costs | Switch AI Orchestrator to local (Ollama). Use cloud only for one-time tasks like mission generation. |

---

### Related Docs

- LLM Manager UI: `decisions/09f/D047-llm-config.md`
- LLM-Enhanced AI: `decisions/09d/D044-llm-ai.md`
- LLM Missions: `decisions/09f/D016-llm-missions.md`
- Skill Library: `decisions/09f/D057-llm-skill-library.md`
- Implementation spec: `research/byollm-implementation-spec.md`
