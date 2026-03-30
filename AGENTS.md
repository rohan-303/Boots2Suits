# Boots2Suits - Agent Instructions

## Product context
Boots2Suits is an AI-powered veteran employment platform.
Core product pillars:
1. Military-to-civilian translation
2. Overall Veteran Persona
3. Employer Job Persona
4. Hybrid semantic matching with explanations

## Tech direction
- Frontend: React + TypeScript + Vite + Tailwind
- Backend: Node + TypeScript + Express
- Database: PostgreSQL + pgvector
- ORM: Drizzle
- Queue: Redis + BullMQ

## Rules
- Prefer small, reviewable changes
- Do not add unnecessary dependencies
- Do not delete files unless explicitly asked
- Preserve clean separation between frontend, backend, worker, and shared packages
- Use Zod validation for inputs
- Keep matching logic explainable and deterministic where possible
- For UI, prioritize clarity, friendliness, and speed
- When unsure, implement the simplest scalable version and document tradeoffs

## Output expectation
After each task, summarize:
- what changed
- files touched
- commands to run
- follow-up tasks
