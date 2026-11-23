import type { EvidencedPoint, SkillName } from "./types";

export type ReviewSkill = {
  score: number | null; // 1-10, or null when the conversation offers insufficient evidence
  turnIndices: number[];
};

export type ReviewPoint = EvidencedPoint & { skill: SkillName; turnIndex: number };

export type ReviewMoment = { point: string; agentTurnIndex: number; userTurnIndex: number };

export type ReviewPractice = {
  skill: SkillName;
  instruction: string;
  exampleReply: string;
  agentTurnIndex: number;
  userTurnIndex: number;
};

/** All indices reference the original, zero-based positions in the frozen transcript. */
export type DateReview = {
  summary: string;
  moments: ReviewMoment[];
  strengths: ReviewPoint[];
  weaknesses: ReviewPoint[];
  skills: Record<SkillName, ReviewSkill>;
  overallScore: number | null; // out of 100
  practice: ReviewPractice | null;
  model: string | null;
  rubricVersion: string;
  transcriptHash: string;
};

/** The part of a review that history lists and progress charts read. */
export type ReviewScores = {
  scores: Partial<Record<SkillName, number>>;
  overallScore: number | null;
  rubricVersion: string;
};
