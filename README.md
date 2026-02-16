# Noema - AI-Enhanced Metacognitive Learning Platform

Shield: [![CC BY-NC-ND 4.0][cc-by-nc-nd-image]][cc-by-nc-nd]
[![CC BY-NC-ND 4.0][cc-by-nc-nd-shield]][cc-by-nc-nd]
[![License: NRAAL v1.0][nraal-shield]][nraal-link]
[![License: NNPL v1.0][nnpl-shield]][nnpl-link]
[![CLA Required][cla-shield]][cla-link]

**Agent-first, API-first microservices architecture for transformative learning**

## Overview

Noema is a doctoral-level research platform combining:
- Spaced repetition (FSRS v6.1.1)
- Knowledge graphs (dual PKG/CKG with formal guardrails)
- LLM agents (10 specialized orchestrators)
- Metacognition (7-frame cognitive stack traces)
- 30 epistemic learning modes

**This is not a flashcard app. This is a cognitive operating system.**

## Quick Start

```bash
git clone https://github.com/yourusername/noema.git
cd noema
pnpm install
docker-compose up
```

## Documentation

- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) - Complete project overview
- [architecture-plan.md](architecture-plan.md) - 66-week implementation roadmap
- [.copilot/](./copilot/) - Development guides

## Features

- 22+ card types
- 4 scheduling algorithms (FSRS, SM-2, Leitner, HLR)
- 30 epistemic modes
- Dual-graph knowledge system
- 10 LLM agents
- Gamification with Memory Integrity Score

## Tech Stack

- **Backend:** Node.js + TypeScript + Fastify + Prisma
- **Mobile:** React Native + Expo + WatermelonDB
- **AI:** Python + FastAPI + LangChain + OpenAI/Anthropic
- **Data:** PostgreSQL + Redis + Qdrant + MinIO

## License

⚖️ Licensing Overview

Noema is source-available and non-commercial.

- Academic institutions → NRAAL v1.0
- Individual non-commercial evaluation → NNPL v1.0
- Commercial use → Separate agreement required

All contributions require acceptance of the Contributor License Agreement.

This work is licensed under a
[Creative Commons Attribution-NonCommercial-NoDerivs 4.0 International License][cc-by-nc-nd].

[cc-by-nc-nd]: http://creativecommons.org/licenses/by-nc-nd/4.0/
[cc-by-nc-nd-image]: https://licensebuttons.net/l/by-nc-nd/4.0/88x31.png
[cc-by-nc-nd-shield]: https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-lightgrey.svg

This software is licensed for academic use under the
NOEMA Research-Only Academic License (NRAAL) v1.0.

[nraal-link]: ./licenses/NOEMA-ACADEMIC-LICENSE.txt
[nraal-shield]: https://img.shields.io/badge/License-NRAAL%20v1.0-blue.svg

This software is licensed under the
NOEMA Non-Commercial Protective License (NNPL) v1.0.

[nnpl-link]: ./licenses/NOEMA-NONCOMMERCIAL-LICENSE.txt
[nnpl-shield]: https://img.shields.io/badge/License-NNPL%20v1.0-green.svg

Contributions require acceptance of the
NOEMA Contributor License Agreement (CLA) v1.0.

[cla-link]: ./licenses/NOEMA-CONTRIBUTOR-AGREEMENT.txt
[cla-shield]: https://img.shields.io/badge/CLA-Required-yellow.svg
