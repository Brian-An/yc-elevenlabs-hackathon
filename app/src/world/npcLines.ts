/**
 * What the passers-by say when you walk past, one entry per EXTRAS index in layout.ts.
 * The audio is generated once with scripts/generate-npc-lines.ts and served from public/audio/npc.
 * After changing a line, run that script again with --force so the clip matches the text.
 */
export type NpcVoice = {
  gender: "female" | "male";
  age: "young" | "middle_aged" | "old";
  accent: string;
  /** A few words on tone, matched against ElevenLabs voice descriptions. */
  description: string;
};

export type NpcLines = { voice: NpcVoice; lines: readonly string[] };

export const NPC_LINES: readonly NpcLines[] = [
  // Casual2_Female
  {
    voice: { gender: "female", age: "young", accent: "american", description: "bright, playful, upbeat" },
    lines: [
      "Is it me, or is everyone here on a date?",
      "My horoscope said talk to strangers. Not you, though.",
      "I've circled this plaza six times. I'm not lost, I'm warming up.",
    ],
  },
  // Suit_Male
  {
    voice: { gender: "male", age: "middle_aged", accent: "british", description: "dry, deadpan, calm" },
    lines: [
      "Splendid weather for crippling romantic anxiety.",
      "I'm not lost. I'm networking.",
      "Ah, the café. Where small talk goes to die.",
    ],
  },
  // Casual3_Female
  {
    voice: { gender: "female", age: "young", accent: "australian", description: "cheerful, energetic, friendly" },
    lines: [
      "Pro tip: ask about their dog. Always the dog.",
      "If a guy in a red jacket asks, I was never here.",
      "Second date? Wear the lucky socks.",
    ],
  },
  // Casual2_Male
  {
    voice: { gender: "male", age: "young", accent: "american", description: "goofy, casual, warm" },
    lines: [
      "I practised my opener in the mirror. The mirror left.",
      "Hey! Oh, sorry. Thought you were my date.",
      "Confidence is just nerves wearing sunglasses.",
    ],
  },
  // Suit_Female
  {
    voice: { gender: "female", age: "middle_aged", accent: "american", description: "brisk, confident, professional" },
    lines: [
      "I scheduled thirty minutes for love. Twenty-eight left.",
      "Eye contact. Firm handshake. Don't mention the ex.",
      "Excuse me, I'm late for my emotional growth.",
    ],
  },
  // OldClassy_Female
  {
    voice: { gender: "female", age: "old", accent: "british", description: "warm, wise, gentle" },
    lines: [
      "In my day, we just shouted across the town square.",
      "Ask them questions, dear. People love talking about themselves.",
      "Married three times. I'm still taking notes.",
    ],
  },
  // Worker_Male
  {
    voice: { gender: "male", age: "middle_aged", accent: "american", description: "gruff, deep, friendly" },
    lines: [
      "Nobody ever asks the lamp guy out.",
      "Thirty years building things. Still can't build a conversation.",
      "Relax, kid. Worst case, you get a free coffee.",
    ],
  },
  // Chef_Female
  {
    voice: { gender: "female", age: "middle_aged", accent: "american", description: "lively, expressive, animated" },
    lines: [
      "A good date is like risotto. Keep stirring.",
      "If they won't share dessert, run.",
      "Garlic before a date? Bold. I respect it.",
    ],
  },
];

/** Where a passer-by's line is served from. */
export const npcLineUrl = (extra: number, line: number) => `/audio/npc/${extra}-${line}.mp3`;
