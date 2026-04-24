import { Router, type IRouter } from "express";
import { MsEdgeTTS, OUTPUT_FORMAT, type Voice } from "msedge-tts";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const BANGLA_REGEX = /[\u0980-\u09FF]/;

function pickDefaultVoice(text: string): string {
  if (BANGLA_REGEX.test(text)) {
    return "bn-BD-NabanitaNeural";
  }
  return "en-US-AriaNeural";
}

let voicesCache: Voice[] | null = null;
let voicesCachePromise: Promise<Voice[]> | null = null;

async function loadVoices(): Promise<Voice[]> {
  if (voicesCache) return voicesCache;
  if (voicesCachePromise) return voicesCachePromise;
  const tts = new MsEdgeTTS();
  voicesCachePromise = tts
    .getVoices()
    .then((voices) => {
      voicesCache = voices;
      voicesCachePromise = null;
      return voices;
    })
    .catch((err) => {
      voicesCachePromise = null;
      throw err;
    });
  return voicesCachePromise;
}

router.get("/tts/voices", async (_req, res) => {
  try {
    const voices = await loadVoices();
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.json({ voices });
  } catch (err) {
    logger.error({ err }, "tts voices error");
    res.status(500).json({ error: "failed to load voices" });
  }
});

router.post("/tts", async (req, res) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const voiceInput =
      typeof req.body?.voice === "string" && req.body.voice.trim().length > 0
        ? req.body.voice.trim()
        : null;

    if (!text) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    if (text.length > 5000) {
      res.status(400).json({ error: "text too long (max 5000 chars)" });
      return;
    }

    const voice = voiceInput ?? pickDefaultVoice(text);

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(text);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");

    audioStream.on("data", (chunk: Buffer) => {
      res.write(chunk);
    });

    audioStream.on("close", () => {
      res.end();
      try {
        tts.close();
      } catch {
        // ignore
      }
    });

    audioStream.on("error", (err: Error) => {
      logger.error({ err }, "tts stream error");
      try {
        tts.close();
      } catch {
        // ignore
      }
      if (!res.headersSent) {
        res.status(500).json({ error: "tts failed" });
      } else {
        res.end();
      }
    });

    req.on("close", () => {
      try {
        tts.close();
      } catch {
        // ignore
      }
    });
  } catch (err) {
    logger.error({ err }, "tts route error");
    if (!res.headersSent) {
      res.status(500).json({ error: "tts failed" });
    }
  }
});

export default router;
