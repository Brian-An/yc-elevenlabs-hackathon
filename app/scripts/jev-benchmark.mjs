import { execFileSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
import { buildGradeRequest, gradeTurn } from "../src/server/jev.ts";

const baselineRef = process.argv[2] ?? "8d8e6faa67a4443d967d1a695652525462410ea5";
const repeats = Number(process.argv[3] ?? 3);
if (!Number.isInteger(repeats) || repeats < 2) throw new Error("Supply at least two repetitions");
if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error("Set TYPESAFE_API_KEY to run the live Jev benchmark");

const baselineSource = execFileSync("git", ["show", `${baselineRef}:app/src/server/jev.ts`], { encoding: "utf8" });
const model = JSON.parse(buildGradeRequest(
  [{ speaker: "user", text: "Hi", timestamp: 0 }], 0, { setting: "café" }, { name: "Maya" },
)).model;
const baselineModule = stripTypeScriptTypes(baselineSource.replace(
  /^const MODEL = "jev-latest";$/m,
  `const MODEL = ${JSON.stringify(model)};`,
));
const baseline = await import(`data:text/javascript;base64,${Buffer.from(baselineModule).toString("base64")}`);

const persona = { name: "Maya", personality: "Warm and curious" };
const scenario = { setting: "First date at a café" };

// Independent synthetic exchanges with expected badges and optional listening anchor (0–4).
const examples = [
  ["I tried pottery last weekend.", "Nice. What was the first thing you made, and did it survive the kiln?", "great", 4],
  ["I get nervous singing in front of people.", "That sounds intimidating. Was there a moment it started to feel fun?", "great", 4],
  ["My dog was scared of the fireworks.", "Mine hides under the bed too. What helped yours settle down?", "great", 4],
  ["I just moved here and miss the food back home.", "What dish makes you feel most at home? I’d love to hear about it.", "great", 4],
  ["I started running again after an injury.", "That first run back must have meant a lot. How did it feel?", "great", 4],
  ["Do you cook much?", "A little. I make a good shakshuka on Sundays.", "good", 2],
  ["I like this café.", "Same. The patio is especially nice in the summer.", "good", 3],
  ["How was your trip?", "Fun! I found a tiny bookstore that stayed open till midnight.", "good", 2],
  ["I’m into sci-fi.", "I am too. Have you read anything good lately?", "good", 3],
  ["Would you rather walk or sit here?", "I’d rather walk. It’s finally cool enough to be outside.", "good", 2],
  ["Did you find the place okay?", "Yep.", "neutral", 2],
  ["Want another napkin?", "No, thanks.", "neutral", 2],
  ["Is this your coffee?", "Yes, that’s mine.", "neutral", 2],
  ["Is this seat taken?", "No.", "neutral", 2],
  ["Did you walk here?", "I did.", "neutral", 2],
  ["What was the best part of your week?", "It was fine.", "inaccuracy", 1],
  ["I got into the choir I auditioned for!", "Okay.", "inaccuracy", 1],
  ["What do you like about living here?", "I don’t really think about it.", "inaccuracy", 1],
  ["I just got back from my first solo trip!", "Oh. Right.", "inaccuracy", 1],
  ["What would you do with a whole free weekend?", "Stuff, I guess.", "inaccuracy", 1],
  ["I was really proud of finishing my first 5K.", "It’s only five kilometres. That’s barely anything.", "mistake"],
  ["I’m worried my job interview went badly.", "Whatever. Let’s talk about my vacation.", "mistake"],
  ["I spend weekends painting.", "That sounds like a waste of time.", "mistake"],
  ["My cat passed away recently.", "So anyway, did you see the game?", "mistake", 0],
  ["I was excited to show you the song I wrote.", "Nobody wants to hear a whole song right now.", "mistake"],
  ["I’d rather not share my address.", "You owe me your address. Tell me now.", "blunder"],
  ["Please stop asking about my ex.", "No, I’m going to keep asking until you tell me.", "blunder"],
  ["I’m going to head home after this.", "You’re not allowed to leave until I say so.", "blunder"],
  ["I don’t want a hug, thanks.", "I’m hugging you anyway.", "blunder"],
  ["I’m having a nice time.", "You’re a pathetic idiot.", "blunder"],
];

const versions = {
  baseline: (transcript) => baseline.gradeTurn(transcript, 1, scenario, persona),
  revised: (transcript) => gradeTurn(buildGradeRequest(transcript, 1, scenario, persona), 1),
};

const results = {};
for (const [name, grade] of Object.entries(versions)) {
  let correct = 0;
  let unstable = 0;
  let falseHarsh = 0;
  let harshTrials = 0;
  let listeningError = 0;
  let listeningTrials = 0;
  const isHarsh = (label) => label === "mistake" || label === "blunder";
  for (const [prompt, reply, expected, listening] of examples) {
    const transcript = [
      { speaker: "agent", text: prompt, timestamp: 0 },
      { speaker: "user", text: reply, timestamp: 2000 },
    ];
    const labels = new Set();
    for (let trial = 0; trial < repeats; trial++) {
      const result = await grade(transcript);
      labels.add(result.classification);
      correct += Number(result.classification === expected);
      if (!isHarsh(expected)) {
        harshTrials++;
        falseHarsh += Number(isHarsh(result.classification));
      }
      if (listening !== undefined) {
        listeningTrials++;
        listeningError += Math.abs(result.scores.listening - (1 + 9 * listening / 4));
      }
    }
    unstable += Number(labels.size > 1);
  }
  results[name] = {
    correctBadges: `${correct}/${examples.length * repeats}`,
    examplesWithBadgeFlips: `${unstable}/${examples.length}`,
    falseHarshBadges: `${falseHarsh}/${harshTrials}`,
    listeningMeanAbsoluteError: +(listeningError / listeningTrials).toFixed(2),
  };
}
console.table(results);
