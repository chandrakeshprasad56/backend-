const ABUSE_TERMS = [
  "idiot",
  "stupid",
  "fraud",
  "scam",
  "hate",
  "bastard",
  "loser",
  "useless",
  "chutiya",
  "madarchod",
  "bhosdike",
];

const SPAM_TERMS = [
  "buy now",
  "click here",
  "subscribe",
  "follow me",
  "whatsapp me",
  "telegram",
  "promo code",
  "free offer",
];

const GENERIC_FAKE_PATTERNS = [
  "very nice",
  "awesome",
  "good product",
  "best shop",
  "great service",
  "must buy",
];

const normalizeText = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseOllamaJson = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (_err) {
    return null;
  }
};

const callOllamaModeration = async ({ comment, rating }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tinyllama",
        stream: false,
        prompt: `Classify this review for abuse/spam/fake.
Return ONLY JSON with keys:
abusive (boolean), spam (boolean), fake (boolean), confidence (0-1), reason (string).
Review text: "${comment || ""}"
Rating: ${rating || 0}`,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    return parseOllamaJson(data?.response);
  } catch (_err) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const hasExcessiveRepeats = (text) => /(.)\1{5,}/i.test(text);
const hasTooManyLinks = (text) => (text.match(/https?:\/\//gi) || []).length >= 2;
const repeatedWords = (text) => {
  const words = normalizeText(text).split(" ").filter(Boolean);
  if (!words.length) return false;
  const map = new Map();
  words.forEach((word) => map.set(word, (map.get(word) || 0) + 1));
  return [...map.values()].some((count) => count >= 4);
};

const uppercaseRatio = (text) => {
  const letters = String(text).replace(/[^a-z]/gi, "");
  if (!letters.length) return 0;
  const uppercase = letters.replace(/[^A-Z]/g, "").length;
  return uppercase / letters.length;
};

const mismatchScore = (rating, comment) => {
  const text = normalizeText(comment);
  if (!text) return 0;
  const negativeWords = ["bad", "worst", "late", "broken", "fake", "poor"];
  const positiveWords = ["excellent", "best", "great", "amazing", "good"];
  const hasNegative = negativeWords.some((w) => text.includes(w));
  const hasPositive = positiveWords.some((w) => text.includes(w));
  if (rating >= 4 && hasNegative) return 12;
  if (rating <= 2 && hasPositive) return 12;
  return 0;
};

const isNearDuplicate = (comment, existingComments = []) => {
  const current = normalizeText(comment);
  if (!current || current.length < 6) return false;
  const set = new Set(existingComments.map((c) => normalizeText(c)).filter(Boolean));
  return set.has(current);
};

const baseHeuristicModeration = ({ name, rating, comment, verifiedBuyer, existingComments }) => {
  const reasons = [];
  const categories = new Set();
  let riskScore = 0;
  const text = String(comment || "");
  const clean = normalizeText(text);

  if (!clean || clean.length < 5) {
    riskScore += 20;
    categories.add("spam");
    reasons.push("Review text is too short.");
  }

  if (ABUSE_TERMS.some((w) => clean.includes(w))) {
    riskScore += 70;
    categories.add("abuse");
    reasons.push("Abusive language detected.");
  }

  if (SPAM_TERMS.some((w) => clean.includes(w))) {
    riskScore += 25;
    categories.add("spam");
    reasons.push("Promotional/spam terms detected.");
  }

  if (hasTooManyLinks(text)) {
    riskScore += 30;
    categories.add("spam");
    reasons.push("Contains multiple external links.");
  }

  if (hasExcessiveRepeats(text) || repeatedWords(text)) {
    riskScore += 20;
    categories.add("spam");
    reasons.push("Repeated text pattern detected.");
  }

  if (uppercaseRatio(text) > 0.7 && text.length > 20) {
    riskScore += 10;
    categories.add("spam");
    reasons.push("Shouting/unnatural uppercase pattern.");
  }

  if (isNearDuplicate(comment, existingComments)) {
    riskScore += 30;
    categories.add("fake");
    reasons.push("Duplicate review text detected.");
  }

  if (!verifiedBuyer && GENERIC_FAKE_PATTERNS.includes(clean)) {
    riskScore += 20;
    categories.add("fake");
    reasons.push("Generic template-style review from non-verified buyer.");
  }

  riskScore += mismatchScore(Number(rating) || 0, comment);
  if ((Number(rating) || 0) >= 5 && clean.length <= 8) {
    riskScore += 12;
    categories.add("fake");
    reasons.push("High rating with low-information text.");
  }

  if (!name || normalizeText(name).length < 2) {
    riskScore += 6;
    categories.add("fake");
    reasons.push("Reviewer identity looks incomplete.");
  }

  let status = "approved";
  if (categories.has("abuse")) status = "rejected";
  else if (riskScore >= 45) status = "flagged";

  return {
    status,
    riskScore: Math.min(100, riskScore),
    categories: [...categories],
    reasons,
    model: "heuristic",
  };
};

const mergeAiSignals = (base, aiResult) => {
  if (!aiResult) return base;

  const merged = { ...base };
  merged.model = "heuristic+ollama";
  merged.ai = aiResult;

  const aiReasons = [];
  if (aiResult.abusive) {
    merged.categories = Array.from(new Set([...merged.categories, "abuse"]));
    merged.riskScore = Math.min(100, merged.riskScore + 40);
    aiReasons.push("AI flagged abusive content.");
  }
  if (aiResult.spam) {
    merged.categories = Array.from(new Set([...merged.categories, "spam"]));
    merged.riskScore = Math.min(100, merged.riskScore + 20);
    aiReasons.push("AI flagged spam behavior.");
  }
  if (aiResult.fake) {
    merged.categories = Array.from(new Set([...merged.categories, "fake"]));
    merged.riskScore = Math.min(100, merged.riskScore + 20);
    aiReasons.push("AI flagged suspicious/fake pattern.");
  }

  if (aiResult.reason) aiReasons.push(String(aiResult.reason));
  merged.reasons = [...merged.reasons, ...aiReasons];

  if (merged.categories.includes("abuse")) merged.status = "rejected";
  else if (merged.riskScore >= 45) merged.status = "flagged";
  else merged.status = "approved";

  return merged;
};

const moderateReview = async ({
  name,
  rating,
  comment,
  verifiedBuyer = false,
  existingComments = [],
}) => {
  const base = baseHeuristicModeration({
    name,
    rating,
    comment,
    verifiedBuyer,
    existingComments,
  });

  const aiResult = await callOllamaModeration({ comment, rating });
  const merged = mergeAiSignals(base, aiResult);

  return {
    ...merged,
    reviewedAt: new Date(),
    publicVisible: merged.status === "approved",
  };
};

const isPublicReview = (review) => {
  const status = review?.moderation?.status;
  return !status || status === "approved";
};

const calculateAverageRating = (reviews = []) => {
  const visible = reviews.filter((r) => r?.rating && isPublicReview(r));
  if (!visible.length) return 0;
  const sum = visible.reduce((acc, r) => acc + Number(r.rating || 0), 0);
  return sum / visible.length;
};

module.exports = {
  moderateReview,
  isPublicReview,
  calculateAverageRating,
};
