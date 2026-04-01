import { PDFParse } from "pdf-parse";

export type ParsedResume = {
  rawText: string;
  summary: string | null;
  experience: string[];
  education: string[];
  certifications: string[];
  skills: string[];
  confidence: number;
};

type SectionBuckets = {
  summary: string[];
  experience: string[];
  education: string[];
  certifications: string[];
  skills: string[];
  other: string[];
};

const SECTION_PATTERNS: Array<{ key: keyof SectionBuckets; regex: RegExp }> = [
  { key: "summary", regex: /^(summary|objective|professional summary)$/i },
  { key: "experience", regex: /^(experience|work experience|professional experience)$/i },
  { key: "education", regex: /^(education|academic background)$/i },
  { key: "certifications", regex: /^(certifications|licenses|credentials)$/i },
  { key: "skills", regex: /^(skills|technical skills|core competencies)$/i }
];

function cleanLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function dedupe(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function parseSections(rawText: string): SectionBuckets {
  const lines = rawText
    .split(/\r?\n/g)
    .map(cleanLine)
    .filter((line) => line.length > 0);

  const buckets: SectionBuckets = {
    summary: [],
    experience: [],
    education: [],
    certifications: [],
    skills: [],
    other: []
  };

  let active: keyof SectionBuckets = "other";
  for (const line of lines) {
    const heading = SECTION_PATTERNS.find((pattern) => pattern.regex.test(line));
    if (heading) {
      active = heading.key;
      continue;
    }
    buckets[active].push(line);
  }
  return buckets;
}

function extractSkills(sectionLines: string[]) {
  const flattened = sectionLines.join(", ");
  const split = flattened
    .split(/[,\u2022|]/g)
    .map(cleanLine)
    .filter((item) => item.length > 1);
  return dedupe(split).slice(0, 40);
}

export async function extractPdfText(fileBuffer: Buffer) {
  const parser = new PDFParse({ data: fileBuffer });
  try {
    const textResult = await parser.getText();
    return textResult.text ?? "";
  } finally {
    await parser.destroy();
  }
}

export function parseResumeText(rawText: string): ParsedResume {
  const sections = parseSections(rawText);
  const summary = sections.summary.length > 0 ? sections.summary.slice(0, 4).join(" ") : null;
  const experience = dedupe(sections.experience).slice(0, 25);
  const education = dedupe(sections.education).slice(0, 15);
  const certifications = dedupe(sections.certifications).slice(0, 15);
  const skills =
    sections.skills.length > 0
      ? extractSkills(sections.skills)
      : extractSkills(sections.experience.filter((line) => line.length < 80));

  const confidenceSignals = [
    summary ? 1 : 0,
    experience.length > 0 ? 1 : 0,
    education.length > 0 ? 1 : 0,
    certifications.length > 0 ? 1 : 0,
    skills.length > 0 ? 1 : 0
  ];
  const confidence = confidenceSignals.reduce((a, b) => a + b, 0) / confidenceSignals.length;

  return {
    rawText,
    summary,
    experience,
    education,
    certifications,
    skills,
    confidence: Number(confidence.toFixed(3))
  };
}
